import { backendHttp, apiId, object, list, utc, decimal, BackendHttpError } from '../../lib/backend-http'
import { backendId, backendKey, requireBackendAccess } from '../auth/backend-runtime'
import { createBackendCashierService, createBackendPaymentAttempt, parseBackendPaymentReceipt, BackendCashierError } from './backend-cashier-service'
import { parseCashierSalesResponse, parseCashierSaleDetailResponse, parseCashierClaimResponse, parseCashierReleaseClaimResponse, parseCashierConfirmResponse, parseCashierPaymentResultResponse } from './cashier-parser'
import type { CashierCursor, CashierPaymentMethod, CashierPaymentResultResponse } from './cashier-types'

export class CashierServiceError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); this.name = 'CashierServiceError' }
}
export interface GetSalesParams { limit?: number; cursor?: CashierCursor | null }
export interface ConfirmPaymentParams { saleId: string; claimToken: string; idempotencyKey: string; method: CashierPaymentMethod; amountReceivedCents?: number | null; reference?: string | null }
async function boundary<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await work() }
  catch (error) {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (error instanceof BackendHttpError || error instanceof BackendCashierError) throw new CashierServiceError(error.message, error.code, error.status)
    throw new CashierServiceError('No se confirmó la operación de Caja. Conserva el intento y consulta su resultado.', 'INCOMPATIBLE_RESPONSE')
  }
}
function saleView(row: Record<string, unknown>, metadata: Record<string, unknown>) {
  return { id: apiId(row.id), folio: row.folio, createdAt: utc(metadata.created_at), totalCents: row.total_cents,
    itemCount: metadata.item_count, status: row.status, createdByLabel: metadata.created_by_label, claimState: metadata.claim_state,
    claimExpiresAt: metadata.claim_expires_at === null ? null : utc(metadata.claim_expires_at), serverTime: utc(metadata.server_time) }
}
function itemView(row: Record<string, unknown>) {
  return { id: apiId(row.id), productName: row.product_name, quantity: typeof row.quantity === 'number' ? row.quantity : decimal(row.quantity), unitPriceCents: row.unit_price_cents, lineTotalCents: row.line_total_cents }
}
export function fetchCashierSales(params: GetSalesParams, signal?: AbortSignal) {
  return boundary(async () => {
    const limit = params.limit ?? 25, query = new URLSearchParams({ limit: String(limit), view: 'operations' })
    if (params.cursor) query.set('before_id', String(backendId(params.cursor.id)))
    const result = await backendHttp('cashier/sales?' + query, 'GET', undefined, signal)
    if (result.schema_version !== 1) throw new Error('schema')
    const rows = list(result.items), items = rows.map(row => saleView(row, object(row.operation)))
    return parseCashierSalesResponse({ schemaVersion: 1, items, page: { limit, hasMore: result.next_before_id !== null,
      nextCursor: result.next_before_id === null ? null : { id: apiId(result.next_before_id), createdAt: items.at(-1)?.createdAt } } })
  }, signal)
}
export function fetchCashierSaleDetail(saleId: string, signal?: AbortSignal) {
  return boundary(async () => {
    const result = await backendHttp(`cashier/sales/${backendId(saleId)}?view=operations`, 'GET', undefined, signal)
    if (result.schema_version !== 1) throw new Error('schema')
    return parseCashierSaleDetailResponse({ schemaVersion: 1, sale: saleView(object(result.sale), object(result.operation)), items: list(result.items).map(itemView) })
  }, signal)
}
export function claimSaleForPayment(saleId: string, claimToken: string | null = null, signal?: AbortSignal) {
  return boundary(async () => {
    const { token, context } = requireBackendAccess(), result = await createBackendCashierService().claim(token, backendId(saleId), claimToken, signal)
    if (result.cashier_id !== context.user.id || result.branch_id !== context.branch?.id || (claimToken !== null && (result.claim_token !== claimToken || !result.renewed))) throw new Error('identity')
    return parseCashierClaimResponse({ sale_id: apiId(result.sale_id), branch_id: apiId(result.branch_id), cashier_id: apiId(result.cashier_id),
      claim_token: result.claim_token, created_at: result.created_at, expires_at: result.expires_at, server_time: result.server_time, renewed: result.renewed })
  }, signal)
}
export function releaseSalePaymentClaim(saleId: string, claimToken: string, signal?: AbortSignal) {
  return boundary(async () => {
    const result = await backendHttp(`cashier/sales/${backendId(saleId)}/release`, 'POST', { claim_token: claimToken }, signal)
    if (result.schema_version !== 1 || apiId(result.sale_id) !== saleId || result.claim_token !== claimToken) throw new Error('identity')
    return parseCashierReleaseClaimResponse({ sale_id: saleId, claim_token: claimToken, released_at: utc(result.released_at), closed_reason: result.closed_reason })
  }, signal)
}
export function confirmSalePayment(params: ConfirmPaymentParams, signal?: AbortSignal) {
  return boundary(async () => {
    const { token, context } = requireBackendAccess()
    if (!context.branch?.is_active) throw new Error('branch')
    const attempt = createBackendPaymentAttempt(backendId(params.saleId), context.user.id, context.branch.id,
      { claim_token: params.claimToken, method: params.method, amount_received_cents: params.amountReceivedCents ?? null, reference: params.reference ?? null })
    const original = Object.freeze({ ...attempt, key: await backendKey(params.idempotencyKey, 'payment') })
    const result = await createBackendCashierService().pay(token, original, signal)
    return parseCashierConfirmResponse({ idempotent_replay: result.idempotent_replay,
      sale: { id: apiId(result.sale.id), folio: result.sale.folio, branch_id: apiId(result.sale.branch_id), status: result.sale.status, total_cents: result.sale.total_cents },
      payment: { id: apiId(result.payment.id), sale_id: params.saleId, cashier_id: apiId(result.payment.cashier_id), idempotency_key: params.idempotencyKey,
        method: result.payment.method, amount_due_cents: result.payment.amount_due_cents, amount_received_cents: result.payment.amount_received_cents,
        change_cents: result.payment.change_cents, reference: result.payment.reference, created_at: result.payment.created_at } })
  }, signal)
}
export function getCashierPaymentResult(saleId: string, idempotencyKey: string, signal?: AbortSignal): Promise<CashierPaymentResultResponse> {
  return boundary(async () => {
    const { token, context } = requireBackendAccess()
    if (!context.branch?.is_active) throw new Error('branch')
    const id = backendId(saleId), key = await backendKey(idempotencyKey, 'payment')
    let result: Record<string, unknown>
    try { result = await backendHttp(`cashier/sales/${id}/payment-result`, 'POST', {}, signal, key) }
    catch (error) {
      if (!(error instanceof BackendHttpError) || error.status !== 404 || error.code !== 'PAYMENT_NOT_FOUND') throw error
      const detail = await backendHttp(`cashier/sales/${id}?view=operations`, 'GET', undefined, signal)
      return parseCashierPaymentResultResponse({ schemaVersion: 1, status: 'NOT_FOUND', serverTime: utc(object(detail.operation).server_time) })
    }
    const receipt = parseBackendPaymentReceipt(result, { saleId: id, cashierId: context.user.id, branchId: context.branch.id })
    const canonical = await createBackendCashierService().receipt(token, receipt.payment.id, { userId: context.user.id, branchId: context.branch.id }, signal)
    const detail = await backendHttp(`cashier/sales/${id}?view=operations`, 'GET', undefined, signal), metadata = object(detail.operation)
    return parseCashierPaymentResultResponse({ schemaVersion: 1, status: 'SUCCEEDED',
      sale: { id: saleId, folio: canonical.sale.folio, createdAt: utc(metadata.created_at), totalCents: canonical.sale.total_cents, createdByLabel: metadata.created_by_label },
      items: canonical.items.map(row => itemView(row)), branch: { name: canonical.branch.name },
      payment: { method: canonical.payment.method, amountReceivedCents: canonical.payment.method === 'CASH' ? canonical.payment.amount_received_cents : null,
        changeCents: canonical.payment.method === 'CASH' ? canonical.payment.change_cents : null, reference: canonical.payment.reference, createdAt: canonical.payment.created_at },
      serverTime: utc(metadata.server_time) })
  }, signal)
}
