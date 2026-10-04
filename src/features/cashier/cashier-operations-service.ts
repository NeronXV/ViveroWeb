import { requireBackendAccess } from '../auth/backend-runtime'
import { apiId } from '../../lib/backend-http'
import { createBackendCashierOperationAttempt, createBackendCashierOperationsService, readBackendCashierOperationAttempt, finishBackendCashierOperationAttempt, BackendCashierOperationError, type CashierOperationAttempt } from './backend-cashier-operations-service'

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

function access() {
  const { token, context } = requireBackendAccess()
  if (!context.branch?.is_active) throw new Error('La sucursal no está disponible.')
  return { token, identity: { userId: context.user.id, branchId: context.branch.id } }
}
function closingView(value: unknown) {
  const row = object(value)
  return parseClosing({ id: apiId(row.id), createdAt: row.created_at, expectedCashCents: row.expected_cash_cents,
    countedCashCents: row.counted_cash_cents, differenceCents: row.difference_cents })
}
async function safe<T>(action: () => Promise<T>): Promise<T> {
  try { return await action() } catch (error) {
    if (error instanceof BackendCashierOperationError) throw new Error(errors[error.code] ?? error.message)
    throw error
  }
}
export async function loadClosing(signal?: AbortSignal) {
  return safe(async () => {
    const { token, identity } = access()
    const row = await createBackendCashierOperationsService().closingPreview(token, identity, signal)
    return parseClosingPreview({ payments: { cash: row.cash_sales_cents, card: row.card_sales_cents, transfer: row.transfer_sales_cents, count: row.payment_count },
      refunds: { cash: row.cash_refunds_cents, other: row.other_refunds_cents, count: row.refund_count }, lastClosing: row.last_closing === null ? null : closingView(row.last_closing) })
  })
}
export function pendingCashierOperation(): CashierOperationAttempt | null {
  return readBackendCashierOperationAttempt(localStorage, access().identity)
}
export async function completeCashierOperation(attempt: CashierOperationAttempt) {
  await finishBackendCashierOperationAttempt(localStorage, attempt)
}
async function execute(attempt: CashierOperationAttempt) {
  const { token, identity } = access(), service = createBackendCashierOperationsService()
  if (attempt.userId !== identity.userId || attempt.branchId !== identity.branchId) throw new Error('El intento pertenece a otra sesión o sucursal.')
  // Only the original durable attempt may be retried; never replace an uncertain payload.
  const pending = readBackendCashierOperationAttempt(localStorage, identity)
  if (pending && (pending.kind !== attempt.kind || pending.saleId !== attempt.saleId || pending.body !== attempt.body)) throw new Error('Hay una operación pendiente. Recupera su resultado antes de registrar otra.')
  const original = pending ?? attempt
  let result: Record<string, unknown>
  if (pending?.kind === 'closing') {
    try { result = await service.recoverClosing(token, original) }
    catch (error) {
      if (!(error instanceof BackendCashierOperationError) || error.status !== 404 || error.code !== 'CLOSING_NOT_FOUND') throw error
      result = await service.submit(token, original, localStorage)
    }
  } else result = await service.submit(token, original, localStorage)
  return { result, attempt: original }
}
export async function closeCashier(opening: number, counted: number, key: string) {
  return safe(async () => {
    if (!key) throw new Error('Falta la clave del intento.')
    const { identity } = access()
    const { result, attempt } = await execute(createBackendCashierOperationAttempt(identity, 'closing', { opening_cash_cents: opening, counted_cash_cents: counted }))
    return { ...closingView(result.closing), attempt }
  })
}
export async function lookupRefund(folio: string) {
  return safe(async () => {
    const { token, identity } = access()
    const row = await createBackendCashierOperationsService().refundLookup(token, identity, folio)
    return { saleId: apiId(row.sale_id), folio: text(row.folio), amountCents: cents(row.amount_cents), alreadyRefunded: row.already_refunded as boolean, restockAvailable: row.restock_available as boolean }
  })
}
export async function refundSale(folio: string, reason: string, method: string, restock: boolean, key: string) {
  return safe(async () => {
    if (!key) throw new Error('Falta la clave del intento.')
    if (!['CASH', 'CARD', 'TRANSFER'].includes(method)) throw new Error('Medio de devolución inválido.')
    const { identity } = access(), lookup = await lookupRefund(folio)
    const { result, attempt } = await execute(createBackendCashierOperationAttempt(identity, 'refund', { reason, method: method as 'CASH' | 'CARD' | 'TRANSFER', restock, money_returned: true }, Number(lookup.saleId)))
    const row = object(result.refund)
    return { id: apiId(row.id), amountCents: cents(row.amount_cents), attempt }
  })
}
export async function recoverCashierOperation() {
  return safe(async () => {
    const pending = pendingCashierOperation()
    if (!pending) throw new Error('No hay una operación pendiente en este navegador.')
    const { result, attempt } = await execute(pending)
    const message = pending.kind === 'closing' ? 'Corte confirmado. Diferencia: ' + cents(object(result.closing).difference_cents) + ' centavos.'
      : 'Devolución confirmada por ' + cents(object(result.refund).amount_cents) + ' centavos. No vuelvas a entregar dinero.'
    return { message, attempt }
  })
}
