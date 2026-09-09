import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchSupplierPurchases,
  PurchaseServiceError,
} from './purchases-service'
import type {
  PurchaseStatus,
  Supplier,
  SupplierPurchaseListItem,
} from './purchases-types'

export function usePurchases(active: boolean) {
  const [purchases, setPurchases] = useState<SupplierPurchaseListItem[]>([])
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | 'ALL'>('ALL')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false)
  const [customSuppliers, setCustomSuppliers] = useState<Supplier[]>([])

  const loadPurchases = useCallback(async () => {
    if (!active) return

    setIsLoading(true)
    setError(null)
    setIsBackendUnavailable(false)

    try {
      const filter = statusFilter === 'ALL' ? null : statusFilter
      const res = await fetchSupplierPurchases({ status: filter, limit: 100 })
      setPurchases(res.items)
    } catch (err) {
      if (err instanceof PurchaseServiceError) {
        setError(err.message)
        setIsBackendUnavailable(err.isBackendUnavailable)
      } else {
        setError('Error al cargar el historial de compras.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [active, statusFilter])

  useEffect(() => {
    loadPurchases()
  }, [loadPurchases])

  const addSupplier = useCallback((supplier: Supplier) => {
    setCustomSuppliers((prev) => {
      const exists = prev.some((s) => s.id === supplier.id || s.code === supplier.code)
      if (exists) {
        return prev.map((s) => (s.id === supplier.id || s.code === supplier.code ? supplier : s))
      }
      return [supplier, ...prev]
    })
  }, [])

  // Consolidate unique suppliers observed in purchases + dynamically added ones
  const knownSuppliers = useMemo(() => {
    const map = new Map<string, Supplier>()
    purchases.forEach((p) => {
      if (p.supplier?.id) map.set(p.supplier.id, p.supplier)
    })
    customSuppliers.forEach((s) => {
      map.set(s.id, s)
    })
    return Array.from(map.values())
  }, [purchases, customSuppliers])

  // Key KPI metrics
  const pendingDraftsCount = useMemo(() => {
    return purchases.filter((p) => p.status === 'DRAFT').length
  }, [purchases])

  const receivedCount = useMemo(() => {
    return purchases.filter((p) => p.status === 'RECEIVED').length
  }, [purchases])

  const unmatchedLinesCount = useMemo(() => {
    return purchases
      .filter((p) => p.status === 'DRAFT')
      .reduce((acc, p) => acc + (p.unmatchedCount || 0), 0)
  }, [purchases])

  return {
    purchases,
    statusFilter,
    setStatusFilter,
    isLoading,
    error,
    isBackendUnavailable,
    knownSuppliers,
    addSupplier,
    pendingDraftsCount,
    receivedCount,
    unmatchedLinesCount,
    refresh: loadPurchases,
  }
}
