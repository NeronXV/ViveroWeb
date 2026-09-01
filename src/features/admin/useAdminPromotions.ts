import { useCallback, useEffect, useState } from 'react'
import { fetchAdminPromotions, upsertCatalogPromotion } from './admin-promotions-service'
import type { AdminPromotion, UpsertCatalogPromotionInput } from './admin-promotions-types'
import { AdminServiceError } from './admin-service'

export function useAdminPromotions(active: boolean) {
  const [promotions, setPromotions] = useState<AdminPromotion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading')
    setError(null)
    try {
      const data = await fetchAdminPromotions(signal)
      setPromotions(data)
      setStatus('ready')
    } catch (err) {
      if (signal?.aborted) return
      const message = err instanceof AdminServiceError ? err.message : 'No fue posible cargar las promociones.'
      setError(message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [active, load])

  const handleUpsertPromotion = async (input: UpsertCatalogPromotionInput): Promise<void> => {
    setIsMutating(true)
    setMutationError(null)
    try {
      await upsertCatalogPromotion(input)
      await load()
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al guardar la campaña de promoción.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  return {
    promotions,
    status,
    error,
    isMutating,
    mutationError,
    setMutationError,
    refresh: () => load(),
    upsertPromotion: handleUpsertPromotion,
  }
}
