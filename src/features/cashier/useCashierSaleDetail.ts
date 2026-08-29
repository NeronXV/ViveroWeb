import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCashierSaleDetail, CashierServiceError } from './cashier-service'
import type { CashierSaleDetailResponse } from './cashier-types'

interface DetailState {
  data: CashierSaleDetailResponse | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMsg: string | null
  errorCode: string | null
}

export function useCashierSaleDetail(saleId: string | null) {
  const [state, setState] = useState<DetailState>({
    data: null,
    status: 'idle',
    errorMsg: null,
    errorCode: null,
  })

  const requestSequence = useRef(0)
  const currentControllerRef = useRef<AbortController | null>(null)
  const [retryRevision, setRetryRevision] = useState(0)

  const fetchDetail = useCallback(async () => {
    if (!saleId) {
      setState({ data: null, status: 'idle', errorMsg: null, errorCode: null })
      return
    }

    const requestId = ++requestSequence.current
    currentControllerRef.current?.abort()

    const controller = new AbortController()
    currentControllerRef.current = controller

    setState({ data: null, status: 'loading', errorMsg: null, errorCode: null })

    try {
      const data = await fetchCashierSaleDetail(saleId, controller.signal)

      if (requestId !== requestSequence.current) return

      setState({
        data,
        status: 'ready',
        errorMsg: null,
        errorCode: null,
      })
    } catch (err) {
      if (requestId !== requestSequence.current) return
      if (err instanceof Error && err.name === 'AbortError') return

      const message = err instanceof CashierServiceError ? err.message : 'No fue posible cargar el detalle de la venta.'
      const code = err instanceof CashierServiceError ? err.code ?? 'UNKNOWN' : 'UNKNOWN'

      setState({
        data: null,
        status: 'error',
        errorMsg: message,
        errorCode: code,
      })
    }
  }, [saleId])

  useEffect(() => {
    void fetchDetail()
    return () => {
      currentControllerRef.current?.abort()
    }
  }, [saleId, retryRevision, fetchDetail])

  const retry = useCallback(() => {
    setRetryRevision((current) => current + 1)
  }, [])

  const clearDetail = useCallback(() => {
    setState({ data: null, status: 'idle', errorMsg: null, errorCode: null })
  }, [])

  return {
    saleDetail: state.data,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    errorMsg: state.errorMsg,
    errorCode: state.errorCode,
    retry,
    clearDetail,
  }
}
