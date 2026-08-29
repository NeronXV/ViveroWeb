import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchDailySalesReport, fetchTopProductsReport, AdminServiceError } from './admin-service'
import type { AdminDailySaleReportItem, AdminTopProductReportItem } from './admin-types'

export interface UseAdminReportsResult {
  dailySales: AdminDailySaleReportItem[]
  topProducts: AdminTopProductReportItem[]
  isLoading: boolean
  isError: boolean
  errorMsg: string | null
  startDate: string
  endDate: string
  selectedBranchId: string | null
  setStartDate: (date: string) => void
  setEndDate: (date: string) => void
  setSelectedBranchId: (branchId: string | null) => void
  refresh: () => void
}

export function useAdminReports(initialBranchId: string | null = null): UseAdminReportsResult {
  const getThirtyDaysAgoStr = () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  }
  const getTodayStr = () => new Date().toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(getThirtyDaysAgoStr)
  const [endDate, setEndDate] = useState(getTodayStr)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(initialBranchId)

  const [dailySales, setDailySales] = useState<AdminDailySaleReportItem[]>([])
  const [topProducts, setTopProducts] = useState<AdminTopProductReportItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isError, setIsError] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadReports = useCallback(async (signal: AbortSignal) => {
    setIsLoading(true)
    setIsError(false)
    setErrorMsg(null)

    try {
      const [salesData, productsData] = await Promise.all([
        fetchDailySalesReport({ branchId: selectedBranchId, startDate, endDate }, signal),
        fetchTopProductsReport({ branchId: selectedBranchId, limit: 10 }, signal),
      ])

      if (!isMountedRef.current) return

      setDailySales(salesData)
      setTopProducts(productsData)
    } catch (err) {
      if (!isMountedRef.current || signal.aborted) return

      setIsError(true)
      const msg = err instanceof AdminServiceError ? err.message : 'No fue posible cargar la información de reportes.'
      setErrorMsg(msg)
    } finally {
      if (isMountedRef.current && !signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [selectedBranchId, startDate, endDate])

  useEffect(() => {
    const controller = new AbortController()
    void loadReports(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadReports, refreshTrigger])

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return {
    dailySales,
    topProducts,
    isLoading,
    isError,
    errorMsg,
    startDate,
    endDate,
    selectedBranchId,
    setStartDate,
    setEndDate,
    setSelectedBranchId,
    refresh,
  }
}
