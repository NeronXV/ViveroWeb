import { useCallback, useEffect, useState } from 'react'
import { AdminServiceError, fetchAdminInventoryBalances, fetchInventoryProductOptions } from './admin-service'
import type { AdminInventoryBalance, AdminInventoryProductOption } from './admin-types'

export function useAdminInventory(active: boolean) {
  const [balances, setBalances] = useState<AdminInventoryBalance[]>([])
  const [products, setProducts] = useState<AdminInventoryProductOption[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setStatus('loading')
    setError(null)
    Promise.all([
      fetchAdminInventoryBalances(controller.signal),
      fetchInventoryProductOptions(controller.signal),
    ]).then(([inventory, productOptions]) => {
      setBalances(inventory.items)
      setProducts(productOptions)
      setStatus('ready')
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof AdminServiceError ? reason.message : 'No fue posible cargar el inventario.')
      setStatus('error')
    })
    return () => controller.abort()
  }, [active, revision])

  const refresh = useCallback(() => setRevision((current) => current + 1), [])
  return { balances, products, status, error, refresh }
}
