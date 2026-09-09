import { getSupabaseClient } from '../../lib/supabase/client'

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta incompatible.')
  return value as Record<string, unknown>
}
export function cents(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error('Importe incompatible.')
  return value as number
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Respuesta incompatible.')
  return value
}
export function parseClosing(value: unknown) {
  const row = object(value)
  return { id: text(row.id), createdAt: text(row.createdAt), expectedCashCents: cents(row.expectedCashCents),
    countedCashCents: cents(row.countedCashCents), differenceCents: cents(row.differenceCents) }
}
export function parseClosingPreview(value: unknown) {
  const row = object(value), payments = object(row.payments), refunds = object(row.refunds)
  return { payments: { cash: cents(payments.cash), card: cents(payments.card), transfer: cents(payments.transfer), count: cents(payments.count) },
    refunds: { cash: cents(refunds.cash), other: cents(refunds.other), count: cents(refunds.count) },
    lastClosing: row.lastClosing === null ? null : parseClosing(row.lastClosing) }
}
const errors: Record<string, string> = {
  CLOSING_EMPTY: 'No hay operaciones pendientes de corte. Consulta el último corte registrado.',
  CASHIER_UNAUTHORIZED: 'No tienes permiso para esta caja.',
  REFUND_UNAUTHORIZED: 'La devolución requiere permisos de Caja y autorización de descuentos.',
  REFUND_SALE_UNAVAILABLE: 'No se encontró una venta cobrada con ese folio en tu sucursal.',
  REFUND_DATA_INVALID: 'Revisa el motivo y confirma la devolución presencial del dinero.',
  REFUND_ALREADY_RECORDED: 'Esta venta ya tiene una devolución registrada. No entregues dinero otra vez.',
  IDEMPOTENCY_CONFLICT: 'El intento ya existe con otros datos. Revisa el último resultado.',
}
export async function operation<T>(name: string, parameters: Record<string, unknown>, parse: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, parameters)
    .abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000))
  if (error) throw new Error(errors[error.message] ?? 'No se pudo completar la operación. Revisa el resultado antes de reintentar.')
  return parse(data)
}
export const loadClosing = (signal?: AbortSignal) => operation('get_my_cashier_closing_preview', {}, parseClosingPreview, signal)
export const closeCashier = (opening: number, counted: number, key: string) =>
  operation('close_my_cashier', { p_opening_cash_cents: opening, p_counted_cash_cents: counted, p_idempotency_key: key }, parseClosing)
export const refundSale = (folio: string, reason: string, method: string, restock: boolean, key: string) =>
  operation('refund_sale_in_person', { p_folio: folio, p_reason: reason, p_method: method, p_restock: restock,
    p_money_returned: true, p_idempotency_key: key }, (value) => {
    const row = object(value)
    return { id: text(row.id), amountCents: cents(row.amountCents) }
  })

export const lookupRefund = (folio: string) => operation('get_refundable_sale', { p_folio: folio }, (value) => {
  const row = object(value)
  if (typeof row.alreadyRefunded !== 'boolean') throw new Error('Respuesta incompatible.')
  return { folio: text(row.folio), amountCents: cents(row.amountCents), alreadyRefunded: row.alreadyRefunded }
})
