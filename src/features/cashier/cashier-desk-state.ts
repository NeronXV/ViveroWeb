import { getPaymentAttemptStorageKey, loadPaymentAttempt } from './cashier-payment-state'
import type { CashierPaymentAttempt, CashierClaimState } from './cashier-types'

export const cashierClaimLabel = (state: CashierClaimState) => state === 'AVAILABLE' ? 'Pendiente de pago'
  : state === 'CLAIMED_BY_ME' ? 'En tu atención' : 'Venta en atención'
export const cashierOriginLabel = (origin?: 'WEB_ORDER' | 'DIRECT_SALE') => origin === 'WEB_ORDER' ? 'Pedido web'
  : origin === 'DIRECT_SALE' ? 'Venta directa' : 'Venta'

// Read the existing journal; never allocate, erase or replace a payment here.
export function interruptedCashierPayments(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>, userId: string): CashierPaymentAttempt[] {
  const prefix = getPaymentAttemptStorageKey(userId, '1').slice(0, -1), result: CashierPaymentAttempt[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(prefix)) continue
    const saleId = key.slice(prefix.length), saved = loadPaymentAttempt(storage, userId, saleId)
    if (saved && ['CONFIRMING', 'UNCERTAIN'].includes(saved.status)) result.push(saved)
  }
  return result
}
// Existing journal messages may have been stored by an earlier Web version.
// Change their language at presentation only, retaining the complete warning.
export function cashierWorkerMessage(message: string | null): string | null {
  if (!message) return null
  return message.replace(/comprobante canónico/gi, 'comprobante confirmado').replace(/recuperación canónica/gi, 'comprobación del resultado')
    .replace(/reclamar la venta/gi, 'abrir el cobro').replace(/reclamar/gi, 'abrir el cobro')
    .replace(/claim/gi, 'atención del cobro').replace(/idempotente/gi, 'guardado').replace(/idempotencia/gi, 'protección contra cobros duplicados')
}
