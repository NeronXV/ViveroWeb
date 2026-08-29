import { useCallback, useEffect, useRef, useState } from 'react'
import {
  claimSaleForPayment,
  confirmSalePayment,
  getCashierPaymentResult,
  releaseSalePaymentClaim,
  CashierServiceError,
} from './cashier-service'
import type {
  CashierPaymentAttempt,
  CashierPaymentMethod,
  CashierPaymentResultResponse,
  CashierPaymentStatus,
  CashierSale,
} from './cashier-types'

function generateUuid(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getStorageKey(userId: string, saleId: string): string {
  return `viveroweb_payment_attempt_${userId}_${saleId}`
}

function loadAttemptFromStorage(userId: string, saleId: string): CashierPaymentAttempt | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, saleId))
    if (!raw) return null
    const attempt = JSON.parse(raw) as CashierPaymentAttempt
    if (attempt.version === 1 && attempt.userId === userId && attempt.saleId === saleId) {
      return attempt
    }
  } catch {
    // Ignorar error de lectura
  }
  return null
}

function saveAttemptToStorage(attempt: CashierPaymentAttempt): void {
  try {
    localStorage.setItem(getStorageKey(attempt.userId, attempt.saleId), JSON.stringify(attempt))
  } catch {
    // Ignorar error de escritura
  }
}

function removeAttemptFromStorage(userId: string, saleId: string): void {
  try {
    localStorage.removeItem(getStorageKey(userId, saleId))
  } catch {
    // Ignorar
  }
}

export function useCashierPaymentAttempt(userId: string | null, activeSale: CashierSale | null) {
  const saleId = activeSale?.id ?? null
  const [attempt, setAttempt] = useState<CashierPaymentAttempt | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const renewTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  // Sincronizar referencia montada
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Inicializar o cargar intento desde storage al cambiar de venta
  useEffect(() => {
    if (renewTimerRef.current) {
      window.clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }

    if (!userId || !saleId) {
      setAttempt(null)
      return
    }

    const stored = loadAttemptFromStorage(userId, saleId)
    if (stored) {
      setAttempt(stored)
      // Si el intento quedó en CONFIRMING, resolverlo como UNCERTAIN para conciliar
      if (stored.status === 'CONFIRMING') {
        const uncertainAttempt: CashierPaymentAttempt = {
          ...stored,
          status: 'UNCERTAIN',
          errorMsg: 'La transacción quedó en estado incierto. Se requiere conciliación.',
        }
        setAttempt(uncertainAttempt)
        saveAttemptToStorage(uncertainAttempt)
      }
    } else {
      // Si no existe intento previo, creamos el estado inicial CLAIMING si la venta está disponible
      const newAttempt: CashierPaymentAttempt = {
        version: 1,
        userId,
        saleId,
        idempotencyKey: generateUuid(),
        status: 'CLAIMING',
        claimToken: null,
        claimExpiresAt: null,
        method: null,
        amountReceivedCents: null,
        reference: null,
        errorMsg: null,
        paymentResult: null,
      }
      setAttempt(newAttempt)
    }
  }, [userId, saleId])

  const autoRenewClaim = useCallback(async () => {
    if (!userId || !saleId || !attempt || attempt.status !== 'CLAIMED' || !attempt.claimToken) return

    try {
      const response = await claimSaleForPayment(saleId, attempt.claimToken)
      if (!isMountedRef.current) return

      setAttempt((current) => {
        if (!current || current.saleId !== saleId) return current
        const updated = {
          ...current,
          claimExpiresAt: response.expires_at,
        }
        saveAttemptToStorage(updated)
        return updated
      })
    } catch {
      // Ignorar fallo de renovación automática en background;
      // el cajero recibirá error CLAIM_EXPIRED al confirmar si realmente expira.
    }
  }, [userId, saleId, attempt])

  // Temporizador para renovación automática del claim antes de expirar
  useEffect(() => {
    if (renewTimerRef.current) {
      window.clearTimeout(renewTimerRef.current)
      renewTimerRef.current = null
    }

    if (!attempt || attempt.status !== 'CLAIMED' || !attempt.claimExpiresAt || !userId || !saleId) {
      return
    }

    const expiresAtMs = new Date(attempt.claimExpiresAt).getTime()
    const nowMs = Date.now()
    // Renovar 1 minuto antes de expirar (o 10 segundos antes si falta poco)
    const timeToRenew = Math.max(10_000, expiresAtMs - nowMs - 60_000)

    renewTimerRef.current = window.setTimeout(() => {
      void autoRenewClaim()
    }, timeToRenew)

    return () => {
      if (renewTimerRef.current) window.clearTimeout(renewTimerRef.current)
    }
  }, [attempt, userId, saleId, autoRenewClaim])

  // Flujo 1: Reclamar venta
  const claimSale = useCallback(async () => {
    if (!userId || !saleId || !attempt || actionInProgress) return
    if (attempt.status !== 'CLAIMING' && attempt.status !== 'EXPIRED' && attempt.status !== 'FAILED') return

    setActionInProgress(true)
    try {
      const response = await claimSaleForPayment(saleId, null)
      if (!isMountedRef.current) return

      const updatedAttempt: CashierPaymentAttempt = {
        ...attempt,
        status: 'CLAIMED',
        claimToken: response.claim_token,
        claimExpiresAt: response.expires_at,
        errorMsg: null,
      }
      setAttempt(updatedAttempt)
      saveAttemptToStorage(updatedAttempt)
    } catch (err) {
      if (!isMountedRef.current) return
      const code = err instanceof CashierServiceError ? err.code : 'UNKNOWN'
      const msg = err instanceof Error ? err.message : 'No fue posible reclamar la venta.'

      const nextStatus: CashierPaymentStatus = code === 'CLAIM_UNAVAILABLE' ? 'FAILED' : 'CLAIMING'

      setAttempt((current) => {
        if (!current) return null
        const updated = {
          ...current,
          status: nextStatus,
          errorMsg: msg,
        }
        saveAttemptToStorage(updated)
        return updated
      })
    } finally {
      if (isMountedRef.current) setActionInProgress(false)
    }
  }, [userId, saleId, attempt, actionInProgress])

  // Flujo 2: Liberar claim voluntariamente
  const releaseClaim = useCallback(async () => {
    if (!userId || !saleId || !attempt || !attempt.claimToken || actionInProgress) return
    if (attempt.status !== 'CLAIMED') return

    setActionInProgress(true)
    try {
      await releaseSalePaymentClaim(saleId, attempt.claimToken)
      removeAttemptFromStorage(userId, saleId)
      if (isMountedRef.current) {
        setAttempt(null)
      }
    } catch {
      // Aún si falla la liberación en red, limpiamos el intento local
      removeAttemptFromStorage(userId, saleId)
      if (isMountedRef.current) {
        setAttempt(null)
      }
    } finally {
      if (isMountedRef.current) setActionInProgress(false)
    }
  }, [userId, saleId, attempt, actionInProgress])

  // Flujo 3: Confirmar cobro
  const confirmPayment = useCallback(
    async (method: CashierPaymentMethod, amountReceivedCents: number | null, reference: string | null) => {
      if (!userId || !saleId || !attempt || !attempt.claimToken || actionInProgress) return
      if (attempt.status !== 'CLAIMED' && attempt.status !== 'FAILED') return

      setActionInProgress(true)

      // 1. Persistir intento en LocalStorage en estado CONFIRMING antes de enviar a Supabase
      const confirmingAttempt: CashierPaymentAttempt = {
        ...attempt,
        status: 'CONFIRMING',
        method,
        amountReceivedCents,
        reference,
        errorMsg: null,
      }
      setAttempt(confirmingAttempt)
      saveAttemptToStorage(confirmingAttempt)

      try {
        const response = await confirmSalePayment({
          saleId,
          claimToken: attempt.claimToken,
          idempotencyKey: attempt.idempotencyKey,
          method,
          amountReceivedCents,
          reference,
        })

        if (!isMountedRef.current) return

        // Mapear respuesta exitosa a CashierPaymentResultResponse
        const paymentResult: CashierPaymentResultResponse = {
          schemaVersion: 1,
          status: 'SUCCEEDED',
          sale: {
            id: response.sale.id,
            folio: response.sale.folio,
            createdAt: activeSale?.createdAt ?? new Date().toISOString(),
            totalCents: response.sale.total_cents,
            createdByLabel: activeSale?.createdByLabel ?? null,
          },
          items: [], // En confirm_sale_payment no vienen items de detalle, pero no son necesarios si guardamos en storage
          payment: {
            method: response.payment.method,
            amountReceivedCents: response.payment.amount_received_cents,
            changeCents: response.payment.change_cents,
            reference: response.payment.reference,
            createdAt: response.payment.created_at,
          },
          serverTime: new Date().toISOString(),
        }

        const succeededAttempt: CashierPaymentAttempt = {
          ...confirmingAttempt,
          status: 'SUCCEEDED',
          paymentResult,
        }
        setAttempt(succeededAttempt)
        saveAttemptToStorage(succeededAttempt)
      } catch (err) {
        if (!isMountedRef.current) return

        const code = err instanceof CashierServiceError ? err.code : 'UNKNOWN'
        const msg = err instanceof Error ? err.message : 'No fue posible registrar el pago.'

        // Si ocurre un error de timeout, red o interrupción incierta, pasamos a UNCERTAIN
        const isUncertain = code === 'TIMEOUT' || code === 'UNKNOWN' || (err instanceof Error && err.name === 'AbortError')

        const nextStatus: CashierPaymentStatus = isUncertain
          ? 'UNCERTAIN'
          : code === 'CLAIM_EXPIRED'
          ? 'EXPIRED'
          : 'FAILED'

        const nextAttempt: CashierPaymentAttempt = {
          ...confirmingAttempt,
          status: nextStatus,
          errorMsg: msg,
        }
        setAttempt(nextAttempt)
        saveAttemptToStorage(nextAttempt)
      } finally {
        if (isMountedRef.current) setActionInProgress(false)
      }
    },
    [userId, saleId, attempt, actionInProgress, activeSale],
  )

  // Flujo 4: Conciliar / Recuperar cobro incierto
  const reconcilePayment = useCallback(async () => {
    if (!userId || !saleId || !attempt || actionInProgress) return
    if (attempt.status !== 'UNCERTAIN') return

    setActionInProgress(true)
    try {
      const response = await getCashierPaymentResult(saleId, attempt.idempotencyKey)
      if (!isMountedRef.current) return

      if (response.status === 'SUCCEEDED') {
        const succeededAttempt: CashierPaymentAttempt = {
          ...attempt,
          status: 'SUCCEEDED',
          paymentResult: response,
          errorMsg: null,
        }
        setAttempt(succeededAttempt)
        saveAttemptToStorage(succeededAttempt)
      } else {
        // NOT_FOUND significa que el intento previo nunca se registró en el servidor.
        // Regresamos el estado a CLAIMED para que el cajero pueda reintentar de forma segura.
        const resetAttempt: CashierPaymentAttempt = {
          ...attempt,
          status: 'CLAIMED',
          errorMsg: 'No se encontró registro del cobro anterior. Puedes intentar cobrar nuevamente.',
        }
        setAttempt(resetAttempt)
        saveAttemptToStorage(resetAttempt)
      }
    } catch (err) {
      if (!isMountedRef.current) return
      const msg = err instanceof Error ? err.message : 'No fue posible conciliar el estado del cobro.'
      setAttempt((current) => {
        if (!current) return null
        return {
          ...current,
          errorMsg: msg,
        }
      })
    } finally {
      if (isMountedRef.current) setActionInProgress(false)
    }
  }, [userId, saleId, attempt, actionInProgress])

  // Resetear intento de pago manual (ej. para limpiar después de un cobro completado)
  const resetAttempt = useCallback(() => {
    if (!userId || !saleId) return
    removeAttemptFromStorage(userId, saleId)
    setAttempt({
      version: 1,
      userId,
      saleId,
      idempotencyKey: generateUuid(),
      status: 'CLAIMING',
      claimToken: null,
      claimExpiresAt: null,
      method: null,
      amountReceivedCents: null,
      reference: null,
      errorMsg: null,
      paymentResult: null,
    })
  }, [userId, saleId])

  return {
    attempt,
    actionInProgress,
    claimSale,
    releaseClaim,
    confirmPayment,
    reconcilePayment,
    resetAttempt,
  }
}
