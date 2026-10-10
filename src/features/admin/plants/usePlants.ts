import { useCallback, useEffect, useState } from 'react'
import { fetchAdminCategories, fetchAdminProducts } from '../admin-catalog-service'
import { fetchAdminInventoryBalances } from '../admin-service'
import type { AdminCategory, AdminProduct } from '../admin-catalog-types'
import type { AdminInventoryBalance } from '../admin-types'
import { fetchPlantPreparation, type PlantPreparation } from './plants-service'

export function usePlants(branchId: string, canInventory: boolean) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; products: AdminProduct[]; categories: AdminCategory[];
    preparations: Record<string, PlantPreparation>; balances: AdminInventoryBalance[]; error: string | null; inventoryError: string | null }>({
    status: 'loading', products: [], categories: [], preparations: {}, balances: [], error: null, inventoryError: null,
  })
  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal
    setState(s => ({ ...s, status: 'loading', error: null }))
    void (async () => {
      try {
        const [products, categories] = await Promise.all([fetchAdminProducts({}, signal), fetchAdminCategories(signal)])
        const preparations: Record<string, PlantPreparation> = {}
        let index = 0
        // Existing per-product preparation contract, bounded parallelism.
        await Promise.all(Array.from({ length: Math.min(6, products.length) }, async () => {
          while (index < products.length && !signal.aborted) {
            const p = products[index++]
            preparations[p.id] = await fetchPlantPreparation(p.id, branchId, signal)
          }
        }))
        let balances: AdminInventoryBalance[] = [], inventoryError: string | null = null
        if (canInventory) {
          try {
            const result = await fetchAdminInventoryBalances(signal)
            if (result.branchId !== branchId) throw new Error('Cambió la sucursal. Actualiza la información.')
            balances = result.items
          } catch { inventoryError = 'No se pudieron consultar las existencias. Actualiza para reintentar.' }
        }
        if (!signal.aborted) setState({ status: 'ready', products, categories, preparations, balances, error: null, inventoryError })
      } catch {
        if (!signal.aborted) setState(s => ({ ...s, status: 'error', error: 'No se pudo consultar la preparación de las plantas. Verifica que este entorno tenga aplicado el bloque 1.' }))
      }
    })()
    return () => controller.abort()
  }, [branchId, canInventory, revision])
  const refresh = useCallback(() => setRevision(r => r + 1), [])
  const update = useCallback((product: AdminProduct, preparation: PlantPreparation) => {
    setState(s => ({ ...s, products: s.products.map(p => p.id === product.id ? product : p), preparations: { ...s.preparations, [product.id]: preparation },
      balances: s.balances.map(b => b.productId === product.id ? { ...b, minimumStock: product.minimumStock, isLowStock: b.totalQuantity <= product.minimumStock } : b) }))
  }, [])
  const updateStock = useCallback((balance: AdminInventoryBalance) => {
    if (balance.branchId !== branchId) return
    setState(s => ({ ...s, balances: [...s.balances.filter(b => b.productId !== balance.productId), balance] }))
  }, [branchId])
  return { ...state, refresh, update, updateStock }
}
