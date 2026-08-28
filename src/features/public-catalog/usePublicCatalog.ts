import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPublicCatalog } from './catalog-service'
import type {
  PublicCatalogCategory,
  PublicCatalogCursor,
  PublicCatalogProduct,
  PublicCatalogStatus,
} from './catalog-types'

interface CatalogState {
  queryKey: string
  status: PublicCatalogStatus
  items: PublicCatalogProduct[]
  categories: PublicCatalogCategory[]
  cursor: PublicCatalogCursor | null
  hasMore: boolean
  isLoadingMore: boolean
  pageError: boolean
}

function queryKeyFor(search: string, categoryId: string | null): string {
  return JSON.stringify([search.trim(), categoryId])
}

function appendUnique(current: PublicCatalogProduct[], incoming: PublicCatalogProduct[]): PublicCatalogProduct[] {
  const known = new Set(current.map(({ id }) => id))
  return [...current, ...incoming.filter(({ id }) => !known.has(id))]
}

export function usePublicCatalog(search: string, categoryId: string | null) {
  const queryKey = queryKeyFor(search, categoryId)
  const activeQueryKey = useRef(queryKey)
  activeQueryKey.current = queryKey
  const requestSequence = useRef(0)
  const pageController = useRef<AbortController | null>(null)
  const [retrySequence, setRetrySequence] = useState(0)
  const [state, setState] = useState<CatalogState>({
    queryKey,
    status: 'loading',
    items: [],
    categories: [],
    cursor: null,
    hasMore: false,
    isLoadingMore: false,
    pageError: false,
  })

  useEffect(() => {
    pageController.current?.abort()
    const requestId = ++requestSequence.current
    const controller = new AbortController()
    setState((current) => ({
      queryKey,
      status: 'loading',
      items: [],
      categories: current.categories,
      cursor: null,
      hasMore: false,
      isLoadingMore: false,
      pageError: false,
    }))
    void loadPublicCatalog({ search, categoryId, cursor: null }, controller.signal)
      .then((response) => {
        if (requestId !== requestSequence.current || queryKey !== activeQueryKey.current) return
        setState({
          queryKey,
          status: 'ready',
          items: response.items,
          categories: response.categories,
          cursor: response.page.nextCursor,
          hasMore: response.page.hasMore,
          isLoadingMore: false,
          pageError: false,
        })
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== requestSequence.current || queryKey !== activeQueryKey.current) return
        setState((current) => ({ ...current, queryKey, status: 'error', items: [], cursor: null, hasMore: false }))
      })
    return () => {
      controller.abort()
      pageController.current?.abort()
    }
  }, [categoryId, queryKey, retrySequence, search])

  const loadMore = useCallback(() => {
    if (state.queryKey !== queryKey || state.status !== 'ready' || !state.hasMore || !state.cursor || state.isLoadingMore) return
    const requestId = ++requestSequence.current
    const requestedCursor = state.cursor
    const controller = new AbortController()
    pageController.current?.abort()
    pageController.current = controller
    setState((current) => ({ ...current, isLoadingMore: true, pageError: false }))
    void loadPublicCatalog({ search, categoryId, cursor: requestedCursor }, controller.signal)
      .then((response) => {
        if (requestId !== requestSequence.current || queryKey !== activeQueryKey.current) return
        setState((current) => ({
          ...current,
          items: appendUnique(current.items, response.items),
          categories: response.categories,
          cursor: response.page.nextCursor,
          hasMore: response.page.hasMore,
          isLoadingMore: false,
          pageError: false,
        }))
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== requestSequence.current || queryKey !== activeQueryKey.current) return
        setState((current) => ({ ...current, isLoadingMore: false, pageError: true }))
      })
  }, [categoryId, queryKey, search, state.cursor, state.hasMore, state.isLoadingMore, state.queryKey, state.status])

  return useMemo(() => ({
    ...state,
    status: state.queryKey === queryKey ? state.status : 'loading' as const,
    items: state.queryKey === queryKey ? state.items : [],
    cursor: state.queryKey === queryKey ? state.cursor : null,
    hasMore: state.queryKey === queryKey && state.hasMore,
    isLoadingMore: state.queryKey === queryKey && state.isLoadingMore,
    pageError: state.queryKey === queryKey && state.pageError,
    retry: () => setRetrySequence((current) => current + 1),
    loadMore,
  }), [loadMore, queryKey, state])
}
