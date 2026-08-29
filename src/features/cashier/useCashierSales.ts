import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCashierSales, CashierServiceError } from './cashier-service'
import type { CashierCursor, CashierSale } from './cashier-types'

interface SalesState {
  items: CashierSale[]
  nextCursor: CashierCursor | null
  hasMore: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMsg: string | null
  isLoadingMore: boolean
  isUpdating: boolean
}

export function useCashierSales(limit = 25) {
  const [state, setState] = useState<SalesState>({
    items: [],
    nextCursor: null,
    hasMore: false,
    status: 'idle',
    errorMsg: null,
    isLoadingMore: false,
    isUpdating: false,
  })

  const [refreshRevision, setRefreshRevision] = useState(0)
  const requestSequence = useRef(0)
  const currentControllerRef = useRef<AbortController | null>(null)

  const fetchSalesList = useCallback(
    async (isLoadMore = false) => {
      const requestId = ++requestSequence.current
      currentControllerRef.current?.abort()

      const controller = new AbortController()
      currentControllerRef.current = controller

      if (isLoadMore) {
        setState((current) => ({ ...current, isLoadingMore: true, errorMsg: null }))
      } else {
        setState((current) => ({
          ...current,
          status: current.items.length === 0 ? 'loading' : 'ready',
          isUpdating: current.items.length > 0,
          errorMsg: null,
        }))
      }

      try {
        const cursor = isLoadMore ? state.nextCursor : null
        const response = await fetchCashierSales({ limit, cursor }, controller.signal)

        if (requestId !== requestSequence.current) return

        setState((current) => {
          const newItems = isLoadMore
            ? [...current.items, ...response.items.filter((item) => !current.items.some((i) => i.id === item.id))]
            : response.items

          return {
            items: newItems,
            nextCursor: response.page.nextCursor,
            hasMore: response.page.hasMore,
            status: 'ready',
            errorMsg: null,
            isLoadingMore: false,
            isUpdating: false,
          }
        })
      } catch (err) {
        if (requestId !== requestSequence.current) return
        if (err instanceof Error && err.name === 'AbortError') return

        const message = err instanceof CashierServiceError ? err.message : 'No fue posible cargar las ventas de la caja.'

        setState((current) => ({
          ...current,
          status: isLoadMore ? 'ready' : 'error',
          errorMsg: message,
          isLoadingMore: false,
          isUpdating: false,
        }))
      }
    },
    [limit, state.nextCursor],
  )

  useEffect(() => {
    void fetchSalesList(false)
    return () => {
      currentControllerRef.current?.abort()
    }
  }, [refreshRevision, fetchSalesList])

  const refresh = useCallback(() => {
    setRefreshRevision((current) => current + 1)
  }, [])

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.isLoadingMore || state.status !== 'ready' || state.isUpdating) return
    void fetchSalesList(true)
  }, [fetchSalesList, state.hasMore, state.isLoadingMore, state.status, state.isUpdating])

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
  }
}
