import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCashierSales, CashierServiceError } from './cashier-service'
import type { CashierCursor, CashierSale } from './cashier-types'

export const CASHIER_COORDINATOR_TIMEOUT_MS = 10_000

function currentUpdateTime(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function determineNewComandasNotice(
  currentSales: { id: string }[],
  seenIds: Set<string>,
  isInitialLoadCompleted: boolean
): { newCount: number; notice: string | null } {
  if (!isInitialLoadCompleted) {
    currentSales.forEach((sale) => seenIds.add(sale.id))
    return { newCount: 0, notice: null }
  }

  const newIds = currentSales.map((s) => s.id).filter((id) => !seenIds.has(id))
  if (newIds.length > 0) {
    const newCount = newIds.length
    newIds.forEach((id) => seenIds.add(id))
    return {
      newCount,
      notice: newCount === 1 ? 'Nueva comanda recibida' : `${newCount} nuevas comandas recibidas`
    }
  }

  return { newCount: 0, notice: null }
}

export function shouldPollActive(isTabVisible: boolean, isOnline: boolean, isCriticalPaymentActive: boolean): boolean {
  return isTabVisible && isOnline && !isCriticalPaymentActive
}

export function determinePollingLimit(limit: number, currentItemsCount: number): number {
  return Math.min(50, Math.max(limit, currentItemsCount))
}

export interface CoordinatorState {
  items: CashierSale[]
  nextCursor: CashierCursor | null
  hasMore: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMsg: string | null
  isLoadingMore: boolean
  isUpdating: boolean
  pollingStatus: 'active' | 'offline' | 'error' | 'idle'
  lastUpdatedAt: string | null
  newComandasNotice: string | null
}

export class CashierSalesCoordinator {
  private folio: string | undefined
  private limit: number
  private fetchCall: (params: { limit: number; cursor: CashierCursor | null; folio?: string }, signal: AbortSignal) => Promise<{ items: CashierSale[]; page: { nextCursor: CashierCursor | null; hasMore: boolean } }>
  private onStateChange: (state: CoordinatorState) => void

  state: CoordinatorState = {
    items: [],
    nextCursor: null,
    hasMore: false,
    status: 'idle',
    errorMsg: null,
    isLoadingMore: false,
    isUpdating: false,
    pollingStatus: 'idle',
    lastUpdatedAt: null,
    newComandasNotice: null,
  }

  userId: string | null = null
  branchId: string | null = null
  isTabVisible = true
  isOnline = true
  isCriticalPaymentActive = false

  private mounted = true
  private requestInProgress = false
  private requestSequence = 0
  private currentController: AbortController | null = null
  private isInitialLoadCompleted = false
  private seenSaleIds = new Set<string>()
  private noticeTimeout: ReturnType<typeof setTimeout> | null = null
  private pollingTimeout: ReturnType<typeof setTimeout> | null = null
  private deferredUpdate = false

  constructor(options: {
    limit: number
    fetchCall: (params: { limit: number; cursor: CashierCursor | null; folio?: string }, signal: AbortSignal) => Promise<{ items: CashierSale[]; page: { nextCursor: CashierCursor | null; hasMore: boolean } }>
    onStateChange: (state: CoordinatorState) => void
    isTabVisible?: boolean
    isOnline?: boolean
    isCriticalPaymentActive?: boolean
  }) {
    this.limit = options.limit
    this.fetchCall = options.fetchCall
    this.onStateChange = options.onStateChange
    this.isTabVisible = options.isTabVisible ?? true
    this.isOnline = options.isOnline ?? true
    this.isCriticalPaymentActive = options.isCriticalPaymentActive ?? false
    this.state.pollingStatus = this.determineCurrentPollingStatus()
  }

  private determineCurrentPollingStatus(): 'active' | 'offline' | 'idle' {
    if (!this.isOnline) return 'offline'
    if (!this.isTabVisible || this.isCriticalPaymentActive) return 'idle'
    return 'active'
  }

  private updateState(next: Partial<CoordinatorState>) {
    this.state = { ...this.state, ...next }
    if (this.mounted) {
      this.onStateChange(this.state)
    }
  }

  scheduleNextPoll() {
    if (this.pollingTimeout !== null) {
      clearTimeout(this.pollingTimeout)
      this.pollingTimeout = null
    }

    if (!this.mounted || !this.userId || !this.branchId) return

    // Pause policy check
    if (!this.isTabVisible || !this.isOnline || this.isCriticalPaymentActive) {
      return
    }

    this.pollingTimeout = setTimeout(() => {
      void this.runFetch('poll')
    }, 10_000)
  }

  async runFetch(type: 'initial' | 'manual' | 'more' | 'poll') {
    if (!this.mounted || !this.userId || !this.branchId) return

    if (this.requestInProgress) {
      if (type === 'poll') this.scheduleNextPoll()
      return
    }

    if ((type === 'poll' || type === 'manual') && (this.isCriticalPaymentActive || !this.isTabVisible || !this.isOnline)) {
      this.scheduleNextPoll()
      return
    }

    const currentItemsCount = this.state.items.length
    const currentLimit = determinePollingLimit(this.limit, currentItemsCount)
    const isRefresh = type === 'poll' || type === 'manual'
    // The API paginates by descending numeric ID. Keep the original visible
    // boundary even when new sales move it beyond the first 50 results.
    const visibleBoundary = isRefresh ? this.state.items.at(-1) : undefined

    this.requestInProgress = true
    const currentSeq = ++this.requestSequence
    const controller = new AbortController()
    this.currentController = controller
    let watchdogTimeout: ReturnType<typeof setTimeout> | null = null

    if (type === 'initial') {
      this.updateState({ status: 'loading', errorMsg: null })
    } else if (type === 'more') {
      this.updateState({ isLoadingMore: true, errorMsg: null })
    } else {
      this.updateState({ isUpdating: true, errorMsg: null })
    }

    try {
      const isLoadMore = type === 'more'
      let cursor = isLoadMore ? this.state.nextCursor : null
      const fetchLimit = isLoadMore ? this.limit : currentLimit

      const refreshedItems: CashierSale[] = []
      const refreshedIds = new Set<string>()
      const visitedCursors = new Set<string>()
      // Publish only after the entire visible window has been refreshed.
      let response: Awaited<ReturnType<typeof this.fetchCall>>
      while (true) {
        const watchdog = new Promise<never>((_, reject) => {
          watchdogTimeout = setTimeout(() => {
            reject(new CashierServiceError('Tiempo de espera agotado al cargar las ventas.', 'TIMEOUT'))
            controller.abort()
          }, CASHIER_COORDINATOR_TIMEOUT_MS)
        })
        response = await Promise.race([
          this.fetchCall({ limit: fetchLimit, cursor, ...(this.folio ? { folio: this.folio } : {}) }, controller.signal),
          watchdog,
        ])
        if (watchdogTimeout !== null) clearTimeout(watchdogTimeout)
        watchdogTimeout = null
        if (!this.mounted || currentSeq !== this.requestSequence) return
        if (!isRefresh) break
        if (this.isCriticalPaymentActive || !this.isOnline || !this.isTabVisible) {
          this.updateState({ isUpdating: false })
          return
        }

        for (const item of response.items) {
          if ((!visibleBoundary || Number(item.id) >= Number(visibleBoundary.id)) && !refreshedIds.has(item.id)) {
            refreshedIds.add(item.id)
            refreshedItems.push(item)
          }
        }
        const reachedBoundary = !visibleBoundary || response.items.some(item => Number(item.id) <= Number(visibleBoundary.id))
        if (reachedBoundary || !response.page.hasMore) {
          const lastVisible = refreshedItems.at(-1)
          const trimmed = visibleBoundary && response.items.some(item => Number(item.id) < Number(visibleBoundary.id))
          response = {
            items: lastVisible ? refreshedItems : response.items,
            page: trimmed && lastVisible
              ? { hasMore: true, nextCursor: { id: lastVisible.id, createdAt: lastVisible.createdAt } }
              : response.page,
          }
          break
        }
        const nextCursor = response.page.nextCursor
        if (!nextCursor || visitedCursors.has(nextCursor.id)) {
          throw new CashierServiceError('No fue posible actualizar las ventas de la caja.', 'INCOMPATIBLE_RESPONSE')
        }
        visitedCursors.add(nextCursor.id)
        cursor = nextCursor
      }

      let newItems = this.state.items
      let newNotice: string | null = null

      if (isLoadMore) {
        newItems = [...this.state.items, ...response.items.filter((item) => !this.state.items.some((i) => i.id === item.id))]
        response.items.forEach((item) => this.seenSaleIds.add(item.id))
      } else {
        newItems = response.items
        const { notice } = determineNewComandasNotice(
          response.items,
          this.seenSaleIds,
          this.isInitialLoadCompleted
        )
        if (notice) {
          if (this.noticeTimeout !== null) {
            clearTimeout(this.noticeTimeout)
          }
          newNotice = notice
          this.noticeTimeout = setTimeout(() => {
            this.noticeTimeout = null
            this.updateState({ newComandasNotice: null })
          }, 5000)
        }
        this.isInitialLoadCompleted = true
      }

      const activeStatus = this.determineCurrentPollingStatus()

      this.updateState({
        items: newItems,
        nextCursor: response.page.nextCursor,
        hasMore: response.page.hasMore,
        status: 'ready',
        errorMsg: null,
        isLoadingMore: false,
        isUpdating: false,
        lastUpdatedAt: currentUpdateTime(),
        pollingStatus: activeStatus,
        newComandasNotice: newNotice !== null ? newNotice : this.state.newComandasNotice
      })
    } catch (err) {
      if (!this.mounted || currentSeq !== this.requestSequence) return

      const message = err instanceof CashierServiceError ? err.message : 'No fue posible cargar las ventas de la caja.'

      const nextStatus = !this.isOnline
        ? 'offline'
        : !this.isTabVisible || this.isCriticalPaymentActive
          ? 'idle'
          : 'error'

      this.updateState({
        status: type === 'initial' ? 'error' : this.state.status,
        errorMsg: type === 'initial' ? message : this.state.errorMsg,
        isLoadingMore: false,
        isUpdating: false,
        pollingStatus: nextStatus,
        lastUpdatedAt: currentUpdateTime(),
      })
    } finally {
      if (watchdogTimeout !== null) {
        clearTimeout(watchdogTimeout)
      }
      if (this.mounted && currentSeq === this.requestSequence) {
        this.requestInProgress = false
        this.currentController = null

        const isPaused = !this.isTabVisible || !this.isOnline || this.isCriticalPaymentActive || !this.userId || !this.branchId
        if (this.deferredUpdate && !isPaused) {
          this.deferredUpdate = false
          const fetchType = this.isInitialLoadCompleted ? 'manual' : 'initial'
          void this.runFetch(fetchType)
        } else {
          this.scheduleNextPoll()
        }
      }
    }
  }

  refresh() {
    if (this.requestInProgress) return
    if (this.pollingTimeout !== null) {
      clearTimeout(this.pollingTimeout)
      this.pollingTimeout = null
    }
    const fetchType = this.isInitialLoadCompleted ? 'manual' : 'initial'
    void this.runFetch(fetchType)
  }

  loadMore() {
    if (this.requestInProgress || !this.state.hasMore || this.state.isLoadingMore || this.state.status !== 'ready' || this.state.isUpdating) return
    void this.runFetch('more')
  }

  resetScope(userId: string | null, branchId: string | null, folio?: string) {
    this.folio = folio?.trim() || undefined
    this.userId = userId
    this.branchId = branchId

    this.requestSequence += 1
    if (this.currentController) {
      this.currentController.abort()
      this.currentController = null
    }
    this.requestInProgress = false
    this.isInitialLoadCompleted = false
    this.seenSaleIds.clear()

    if (this.noticeTimeout !== null) {
      clearTimeout(this.noticeTimeout)
      this.noticeTimeout = null
    }
    if (this.pollingTimeout !== null) {
      clearTimeout(this.pollingTimeout)
      this.pollingTimeout = null
    }

    this.deferredUpdate = false

    this.updateState({
      items: [],
      nextCursor: null,
      hasMore: false,
      status: 'idle',
      errorMsg: null,
      isLoadingMore: false,
      isUpdating: false,
      pollingStatus: this.determineCurrentPollingStatus(),
      lastUpdatedAt: null,
      newComandasNotice: null,
    })

    if (userId && branchId) {
      const isPaused = !this.isTabVisible || !this.isOnline || this.isCriticalPaymentActive
      if (!isPaused) {
        void this.runFetch('initial')
      } else {
        this.updateState({ status: 'idle' })
      }
    }
  }

  updateVisibility(visible: boolean) {
    this.isTabVisible = visible
    if (!visible) {
      if (this.pollingTimeout !== null) {
        clearTimeout(this.pollingTimeout)
        this.pollingTimeout = null
      }
      this.updateState({ pollingStatus: 'idle' })
    } else {
      if (this.isOnline && !this.isCriticalPaymentActive && this.userId && this.branchId) {
        if (this.requestInProgress) {
          this.deferredUpdate = true
        } else {
          if (this.pollingTimeout !== null) {
            clearTimeout(this.pollingTimeout)
            this.pollingTimeout = null
          }
          const fetchType = this.isInitialLoadCompleted ? 'manual' : 'initial'
          void this.runFetch(fetchType)
        }
      } else {
        this.updateState({ pollingStatus: this.determineCurrentPollingStatus() })
      }
    }
  }

  updateOnline(online: boolean) {
    this.isOnline = online
    if (!online) {
      if (this.pollingTimeout !== null) {
        clearTimeout(this.pollingTimeout)
        this.pollingTimeout = null
      }
      this.updateState({ pollingStatus: 'offline' })
    } else {
      if (this.isTabVisible && !this.isCriticalPaymentActive && this.userId && this.branchId) {
        if (this.requestInProgress) {
          this.deferredUpdate = true
        } else {
          if (this.pollingTimeout !== null) {
            clearTimeout(this.pollingTimeout)
            this.pollingTimeout = null
          }
          const fetchType = this.isInitialLoadCompleted ? 'manual' : 'initial'
          void this.runFetch(fetchType)
        }
      } else {
        this.updateState({ pollingStatus: this.determineCurrentPollingStatus() })
      }
    }
  }

  updateCriticalPayment(active: boolean) {
    this.isCriticalPaymentActive = active
    if (active) {
      if (this.pollingTimeout !== null) {
        clearTimeout(this.pollingTimeout)
        this.pollingTimeout = null
      }
      this.updateState({ pollingStatus: 'idle' })
    } else {
      if (this.isTabVisible && this.isOnline && this.userId && this.branchId) {
        if (!this.isInitialLoadCompleted) {
          void this.runFetch('initial')
        } else if (!this.requestInProgress) {
          this.scheduleNextPoll()
        }
      }
      this.updateState({ pollingStatus: this.determineCurrentPollingStatus() })
    }
  }

  activate() {
    this.mounted = true
  }

  destroy() {
    this.mounted = false
    if (this.currentController) {
      this.currentController.abort()
    }
    if (this.noticeTimeout !== null) {
      clearTimeout(this.noticeTimeout)
    }
    if (this.pollingTimeout !== null) {
      clearTimeout(this.pollingTimeout)
    }
  }

  // Helper testing selectors
  getSeenIds() {
    return this.seenSaleIds
  }

  isMounted() {
    return this.mounted
  }
}

export function useCashierSales(
  limit = 25,
  isCriticalPaymentActive = false,
  userId: string | null = null,
  branchId: string | null = null,
  folio?: string
) {
  const [state, setState] = useState<CoordinatorState>({
    items: [],
    nextCursor: null,
    hasMore: false,
    status: 'idle',
    errorMsg: null,
    isLoadingMore: false,
    isUpdating: false,
    pollingStatus: 'idle',
    lastUpdatedAt: null,
    newComandasNotice: null,
  })

  const coordinatorRef = useRef<CashierSalesCoordinator | null>(null)

  if (coordinatorRef.current === null) {
    coordinatorRef.current = new CashierSalesCoordinator({
      limit,
      fetchCall: fetchCashierSales,
      onStateChange: (nextState) => {
        setState(nextState)
      },
      isTabVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isCriticalPaymentActive,
    })
  }

  // React StrictMode recreates effects in development while preserving refs.
  // Reactivate the preserved coordinator before any other effect uses it.
  useEffect(() => {
    coordinatorRef.current?.activate()
    return () => {
      coordinatorRef.current?.destroy()
    }
  }, [])

  // Update dynamic values in coordinator imperatively
  useEffect(() => {
    coordinatorRef.current?.updateCriticalPayment(isCriticalPaymentActive)
  }, [isCriticalPaymentActive])

  // Manage visibility and online listeners
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const handleVisibility = () => {
      coordinatorRef.current?.updateVisibility(document.visibilityState === 'visible')
    }
    const handleOnline = () => coordinatorRef.current?.updateOnline(true)
    const handleOffline = () => coordinatorRef.current?.updateOnline(false)

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Reset the existing coordinator when identity, branch or the folio filter changes.
  useEffect(() => {
    coordinatorRef.current?.resetScope(userId, branchId, folio)
  }, [userId, branchId, folio])

  const refresh = useCallback(() => {
    coordinatorRef.current?.refresh()
  }, [])

  const loadMore = useCallback(() => {
    coordinatorRef.current?.loadMore()
  }, [])

  return {
    sales: state.items,
    isLoading: state.status === 'loading',
    isUpdating: state.isUpdating,
    isLoadingMore: state.isLoadingMore,
    isError: state.status === 'error',
    errorMsg: state.errorMsg,
    hasMore: state.hasMore,
    refresh,
    loadMore,
    retry: refresh,
    pollingStatus: state.pollingStatus,
    lastUpdatedAt: state.lastUpdatedAt,
    newComandasNotice: state.newComandasNotice,
  }
}
