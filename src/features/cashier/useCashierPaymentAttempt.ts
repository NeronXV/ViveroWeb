import { useCallback, useEffect, useRef, useState } from 'react'
import {
  claimSaleForPayment,
  confirmSalePayment,
  getCashierPaymentResult,
  releaseSalePaymentClaim,
  CashierServiceError,
} from './cashier-service'
import {
  attachSucceededResult,
  CashierPaymentStateError,
  createPaymentAttempt,
  getPaymentAttemptStorageKey,
  loadPaymentAttempt,
  removePaymentAttempt,
  restoreInterruptedAttempt,
  savePaymentAttempt,
  withPaymentAttemptLock,
} from './cashier-payment-state'
import type { CashierPaymentAttempt, CashierPaymentMethod, CashierSale } from './cashier-types'

function generateUuid(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new CashierPaymentStateError('El navegador no puede generar una clave idempotente segura.')
  }
  return crypto.randomUUID()
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function isSamePayload(
  attempt: CashierPaymentAttempt,
  method: CashierPaymentMethod,
  amountReceivedCents: number | null,
  reference: string | null,
): boolean {
  return attempt.method === null || (
    attempt.method === method
    && attempt.amountReceivedCents === amountReceivedCents
    && attempt.reference === reference
  )
}

export function useCashierPaymentAttempt(userId: string | null, activeSale: CashierSale | null) {
  const saleId = activeSale?.id ?? null
  const [attempt, setAttempt] = useState<CashierPaymentAttempt | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const actionRef = useRef(false)
  const actionControllerRef = useRef<AbortController | null>(null)
  const renewTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(false)
  const identityRef = useRef({ userId, saleId })
  identityRef.current = { userId, saleId }

  const isCurrentIdentity = useCallback((expectedUserId: string, expectedSaleId: string) => (
    mountedRef.current
    && identityRef.current.userId === expectedUserId
    && identityRef.current.saleId === expectedSaleId
  ), [])

  const persist = useCallback((next: CashierPaymentAttempt) => {
    savePaymentAttempt(window.localStorage, next)
    if (isCurrentIdentity(next.userId, next.saleId)) setAttempt(next)
  }, [isCurrentIdentity])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      actionControllerRef.current?.abort()
      if (renewTimerRef.current !== null) window.clearTimeout(renewTimerRef.current)
    }
  }, [])

  useEffect(() => {
    actionControllerRef.current?.abort()
    if (renewTimerRef.current !== null) {
      window.clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }

    if (!userId || !saleId) {
      setAttempt(null)
      return
    }

    try {
      const restored = loadPaymentAttempt(window.localStorage, userId, saleId)
      const next = restoreInterruptedAttempt(restored ?? createPaymentAttempt(userId, saleId, generateUuid()))
      savePaymentAttempt(window.localStorage, next)
      setAttempt(next)
    } catch (error) {
      const fallback = createPaymentAttempt(userId, saleId, generateUuid())
      setAttempt({
        ...fallback,
        errorMsg: errorMessage(error, 'No fue posible preparar almacenamiento seguro para el cobro.'),
      })
    }

    const storageKey = getPaymentAttemptStorageKey(userId, saleId)
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== storageKey) return
      if (event.newValue === null) {
        setAttempt(null)
        return
      }
      const current = loadPaymentAttempt(window.localStorage, userId, saleId)
      if (current) setAttempt(current)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [userId, saleId])

  const beginForegroundAction = useCallback((): AbortController | null => {
    if (actionRef.current) return null
    actionRef.current = true
    setActionInProgress(true)
    const controller = new AbortController()
    actionControllerRef.current = controller
    return controller
  }, [])

  const finishForegroundAction = useCallback((controller: AbortController) => {
    if (actionControllerRef.current === controller) actionControllerRef.current = null
    actionRef.current = false
    if (mountedRef.current) setActionInProgress(false)
  }, [])

  const claimSale = useCallback(async (): Promise<boolean> => {
    if (!userId || !saleId) return false
    const controller = beginForegroundAction()
    if (!controller) return false

    try {
      return await withPaymentAttemptLock(userId, saleId, async () => {
        const current = loadPaymentAttempt(window.localStorage, userId, saleId)
        if (!current || !['CLAIMING', 'EXPIRED'].includes(current.status)) return false
        const response = await claimSaleForPayment(saleId, null, controller.signal)
        if (response.cashier_id !== userId) {
          throw new CashierPaymentStateError('El claim recibido no corresponde al usuario actual.')
        }
        persist({
          ...current,
          status: 'CLAIMED',
          claimToken: response.claim_token,
          claimExpiresAt: response.expires_at,
          method: null,
          amountReceivedCents: null,
          reference: null,
          errorMsg: null,
          paymentResult: null,
        })
        return true
      })
    } catch (error) {
      const current = loadPaymentAttempt(window.localStorage, userId, saleId)
      if (current) persist({ ...current, errorMsg: errorMessage(error, 'No fue posible reclamar la venta.') })
      return false
    } finally {
      finishForegroundAction(controller)
    }
  }, [beginForegroundAction, finishForegroundAction, persist, saleId, userId])

  const renewClaim = useCallback(async () => {
    if (!userId || !saleId || actionRef.current) return
    try {
      await withPaymentAttemptLock(userId, saleId, async () => {
        const current = loadPaymentAttempt(window.localStorage, userId, saleId)
        if (!current || current.status !== 'CLAIMED' || !current.claimToken) return
        try {
          const response = await claimSaleForPayment(saleId, current.claimToken)
          if (response.cashier_id !== userId) {
            throw new CashierPaymentStateError('La renovación no corresponde al usuario actual.')
          }
          persist({ ...current, claimExpiresAt: response.expires_at, errorMsg: null })
        } catch (error) {
          const code = error instanceof CashierServiceError ? error.code : null
          persist({
            ...current,
            status: code === 'CLAIM_EXPIRED' || code === 'CLAIM_NOT_OWNED' ? 'EXPIRED' : 'CLAIMED',
            errorMsg: errorMessage(error, 'No fue posible renovar la reserva; vuelve a intentarlo antes de confirmar.'),
          })
        }
      })
    } catch {
      // Otra pestaña está realizando una operación autoritativa; no se inicia otra renovación.
    }
  }, [persist, saleId, userId])

  useEffect(() => {
    if (renewTimerRef.current !== null) {
      window.clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }
    if (!attempt || attempt.status !== 'CLAIMED' || !attempt.claimExpiresAt) return

    const delay = Math.max(10_000, Date.parse(attempt.claimExpiresAt) - Date.now() - 60_000)
    renewTimerRef.current = window.setTimeout(() => void renewClaim(), delay)
    return () => {
      if (renewTimerRef.current !== null) window.clearTimeout(renewTimerRef.current)
    }
  }, [attempt, renewClaim])

  const releaseClaim = useCallback(async (): Promise<boolean> => {
    if (!userId || !saleId) return false
    const controller = beginForegroundAction()
    if (!controller) return false

    try {
      return await withPaymentAttemptLock(userId, saleId, async () => {
        const current = loadPaymentAttempt(window.localStorage, userId, saleId)
        if (!current || current.status !== 'CLAIMED' || !current.claimToken) return false
        await releaseSalePaymentClaim(saleId, current.claimToken, controller.signal)
        removePaymentAttempt(window.localStorage, userId, saleId)
        if (isCurrentIdentity(userId, saleId)) setAttempt(null)
        return true
      })
    } catch (error) {
      const current = loadPaymentAttempt(window.localStorage, userId, saleId)
      if (current) persist({ ...current, errorMsg: errorMessage(error, 'No fue posible liberar la reserva. La venta continúa seleccionada.') })
      return false
    } finally {
      finishForegroundAction(controller)
    }
  }, [beginForegroundAction, finishForegroundAction, isCurrentIdentity, persist, saleId, userId])

  const confirmPayment = useCallback(async (
    method: CashierPaymentMethod,
    amountReceivedCents: number | null,
    reference: string | null,
  ): Promise<boolean> => {
    if (!userId || !saleId) return false
    const controller = beginForegroundAction()
    if (!controller) return false

    try {
      return await withPaymentAttemptLock(userId, saleId, async () => {
        const current = loadPaymentAttempt(window.localStorage, userId, saleId)
        if (!current || current.status !== 'CLAIMED' || !current.claimToken) return false
        const claimToken = current.claimToken
        if (!isSamePayload(current, method, amountReceivedCents, reference)) {
          throw new CashierPaymentStateError('El intento recuperado debe reenviarse con los mismos datos.')
        }

        const confirming: CashierPaymentAttempt = {
          ...current,
          status: 'CONFIRMING',
          method,
          amountReceivedCents,
          reference,
          errorMsg: null,
        }
        persist(confirming)

        try {
          const confirmation = await confirmSalePayment({
            saleId,
            claimToken,
            idempotencyKey: confirming.idempotencyKey,
            method,
            amountReceivedCents,
            reference,
          }, controller.signal)
          if (confirmation.payment.cashier_id !== userId) {
            throw new CashierPaymentStateError('La confirmación no corresponde al usuario actual.')
          }

          const canonical = await getCashierPaymentResult(saleId, confirming.idempotencyKey, controller.signal)
          if (canonical.status !== 'SUCCEEDED') {
            persist({
              ...confirming,
              status: 'UNCERTAIN',
              errorMsg: 'La confirmación respondió, pero el comprobante canónico todavía no está disponible.',
            })
            return false
          }
          persist(attachSucceededResult(confirming, canonical))
          return true
        } catch (error) {
          const code = error instanceof CashierServiceError ? error.code : null
          persist({
            ...confirming,
            status: code === 'CLAIM_EXPIRED' ? 'EXPIRED' : 'UNCERTAIN',
            errorMsg: errorMessage(error, 'El resultado del cobro es incierto y debe conciliarse.'),
          })
          return false
        }
      })
    } catch (error) {
      const current = loadPaymentAttempt(window.localStorage, userId, saleId)
      if (current && current.status === 'CLAIMED') persist({ ...current, errorMsg: errorMessage(error, 'No fue posible iniciar la confirmación.') })
      return false
    } finally {
      finishForegroundAction(controller)
    }
  }, [beginForegroundAction, finishForegroundAction, persist, saleId, userId])

  const reconcilePayment = useCallback(async (): Promise<boolean> => {
    if (!userId || !saleId) return false
    const controller = beginForegroundAction()
    if (!controller) return false

    try {
      return await withPaymentAttemptLock(userId, saleId, async () => {
        const current = loadPaymentAttempt(window.localStorage, userId, saleId)
        if (!current || !['CONFIRMING', 'UNCERTAIN'].includes(current.status)) return false
        const response = await getCashierPaymentResult(saleId, current.idempotencyKey, controller.signal)
        if (response.status === 'SUCCEEDED') {
          persist(attachSucceededResult(current, response))
          return true
        }

        if (!current.claimToken) {
          persist({ ...current, status: 'UNCERTAIN', errorMsg: 'No existe un claim verificable para reintentar este cobro.' })
          return false
        }

        try {
          const renewed = await claimSaleForPayment(saleId, current.claimToken, controller.signal)
          if (renewed.cashier_id !== userId) {
            throw new CashierPaymentStateError('La revalidación no corresponde al usuario actual.')
          }
          persist({
            ...current,
            status: 'CLAIMED',
            claimExpiresAt: renewed.expires_at,
            errorMsg: 'No se encontró el pago y el claim fue revalidado. Revisa y reenvía exactamente el mismo intento.',
          })
        } catch (claimError) {
          const claimCode = claimError instanceof CashierServiceError ? claimError.code : null
          const unavailable = ['SALE_STATUS_INVALID', 'SALE_UNAVAILABLE', 'CLAIM_NOT_OWNED', 'CLAIM_UNAVAILABLE', 'CLAIM_EXPIRED'].includes(claimCode ?? '')
          persist({
            ...current,
            status: unavailable ? 'UNAVAILABLE' : 'UNCERTAIN',
            errorMsg: `No se encontró el pago y tampoco fue posible validar el claim: ${errorMessage(claimError, 'estado desconocido')}`,
          })
        }
        return false
      })
    } catch (error) {
      const current = loadPaymentAttempt(window.localStorage, userId, saleId)
      if (current) persist({ ...current, status: 'UNCERTAIN', errorMsg: errorMessage(error, 'No fue posible conciliar el cobro.') })
      return false
    } finally {
      finishForegroundAction(controller)
    }
  }, [beginForegroundAction, finishForegroundAction, persist, saleId, userId])

  const dismissSucceededAttempt = useCallback((): boolean => {
    if (!userId || !saleId || attempt?.status !== 'SUCCEEDED') return false
    removePaymentAttempt(window.localStorage, userId, saleId)
    setAttempt(null)
    return true
  }, [attempt?.status, saleId, userId])

  return {
    attempt,
    actionInProgress,
    claimSale,
    releaseClaim,
    confirmPayment,
    reconcilePayment,
    dismissSucceededAttempt,
  }
}
