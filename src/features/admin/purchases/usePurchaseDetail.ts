import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmSupplierPurchase,
  fetchSupplierPurchaseDetail,
  PurchaseServiceError,
  resolveSupplierPurchaseItem,
  setSupplierPresentation,
} from './purchases-service'
import type {
  SetSupplierPresentationInput,
  SizeUnit,
  SupplierPurchaseDetail,
} from './purchases-types'

export function usePurchaseDetail(purchaseId: string | null) {
  const [detail, setDetail] = useState<SupplierPurchaseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false)

  // Confirmation key generated once per purchase and preserved across retries
  const confirmationKeyRef = useRef<string>(crypto.randomUUID())
  const lastPurchaseIdRef = useRef<string | null>(null)

  if (purchaseId !== lastPurchaseIdRef.current) {
    lastPurchaseIdRef.current = purchaseId
    confirmationKeyRef.current = crypto.randomUUID()
  }

  const loadDetail = useCallback(async () => {
    if (!purchaseId) {
      setDetail(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setIsBackendUnavailable(false)

    try {
      const res = await fetchSupplierPurchaseDetail(purchaseId)
      setDetail(res)
    } catch (err) {
      if (err instanceof PurchaseServiceError) {
        setError(err.message)
        setIsBackendUnavailable(err.isBackendUnavailable)
      } else {
        setError('Error al cargar el detalle de la compra.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [purchaseId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const resolveLine = useCallback(async (
    itemId: string,
    resolution: 'MATCHED' | 'IGNORED',
    productId: string | null = null,
    normalizedName: string | null = null,
    presentation: string | null = null,
  ) => {
    if (!purchaseId) return

    setIsResolving(true)
    setError(null)

    try {
      await resolveSupplierPurchaseItem({
        itemId,
        resolution,
        productId,
        normalizedName,
        presentation,
      })
      // Reload authoritative detail
      const updated = await fetchSupplierPurchaseDetail(purchaseId)
      setDetail(updated)
    } catch (err) {
      if (err instanceof PurchaseServiceError) {
        setError(err.message)
        setIsBackendUnavailable(err.isBackendUnavailable)
      } else {
        setError('Error al resolver el renglón de compra.')
      }
      throw err
    } finally {
      setIsResolving(false)
    }
  }, [purchaseId])

  const configurePresentation = useCallback(async (
    code: string,
    displayName: string,
    nominalSize: number | null,
    sizeUnit: SizeUnit | null,
    notes: string | null = null,
  ) => {
    if (!detail?.supplier?.id) {
      throw new Error('No se encontró el proveedor para configurar su presentación.')
    }

    const input: SetSupplierPresentationInput = {
      supplierId: detail.supplier.id,
      code,
      displayName,
      nominalSize,
      sizeUnit,
      notes,
    }

    try {
      await setSupplierPresentation(input)
      if (purchaseId) {
        const updated = await fetchSupplierPurchaseDetail(purchaseId)
        setDetail(updated)
      }
    } catch (err) {
      if (err instanceof PurchaseServiceError) {
        setError(err.message)
      } else {
        setError('Error al guardar la presentación del proveedor.')
      }
      throw err
    }
  }, [detail?.supplier?.id, purchaseId])

  const confirmReception = useCallback(async () => {
    if (!purchaseId || !detail) {
      throw new Error('No hay una compra seleccionada para confirmar.')
    }

    if (detail.status !== 'DRAFT') {
      throw new Error('La compra no se encuentra en estado borrador (DRAFT).')
    }

    if (detail.unmatchedCount > 0) {
      throw new Error(`Existen ${detail.unmatchedCount} renglones sin relacionar. Todos los renglones deben estar relacionados o ignorados.`)
    }

    const hasMatchedLine = detail.items.some((it) => it.resolutionStatus === 'MATCHED' || it.resolutionStatus === 'AUTO_MATCHED')
    if (!hasMatchedLine) {
      throw new Error('Debe existir al menos un renglón relacionado para confirmar la recepción de inventario.')
    }

    setIsConfirming(true)
    setError(null)

    try {
      const updated = await confirmSupplierPurchase({
        purchaseId,
        confirmationKey: confirmationKeyRef.current,
      })
      setDetail(updated)
      return updated
    } catch (err) {
      if (err instanceof PurchaseServiceError) {
        setError(err.message)
        setIsBackendUnavailable(err.isBackendUnavailable)
      } else {
        setError('Error al confirmar la recepción de la compra.')
      }
      throw err
    } finally {
      setIsConfirming(false)
    }
  }, [purchaseId, detail])

  return {
    detail,
    isLoading,
    isResolving,
    isConfirming,
    error,
    isBackendUnavailable,
    confirmationKey: confirmationKeyRef.current,
    resolveLine,
    configurePresentation,
    confirmReception,
    refresh: loadDetail,
  }
}
