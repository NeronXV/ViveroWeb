import { backendId, requireBackendAccess } from '../auth/backend-runtime'
import { apiId, backendHttp, BackendHttpError, object, utc } from '../../lib/backend-http'
import { createBackendAdminOrderService, parseBackendAdminOrderDetail, BackendAdminOrderError } from './backend-admin-order-service'
import type { AdminWebOrder, AdminWebOrdersResponse, WebOrderStatus, WebOrderStatusResult } from './web-order-types'

export class WebOrderServiceError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); this.name = 'WebOrderServiceError' }
}
async function request<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await action() } catch (error) {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (error instanceof BackendAdminOrderError || error instanceof BackendHttpError) throw new WebOrderServiceError(error.message, error.code)
    throw new WebOrderServiceError('No se confirmó la operación. Actualiza el pedido antes de continuar.', 'INCOMPATIBLE_RESPONSE')
  }
}
async function detail(id: number, signal?: AbortSignal): Promise<{ order: AdminWebOrder; serverTime: string }> {
  const raw = await backendHttp(`admin/web-orders/${id}?view=operations`, 'GET', undefined, signal)
  const checked = parseBackendAdminOrderDetail({ schema_version: raw.schema_version, order: raw.order, items: raw.items, history: raw.history }, id)
  const operation = object(raw.operation), branch = object(operation.branch), row = checked.order
  if (branch.id !== row.branch_id || typeof branch.code !== 'string' || typeof branch.name !== 'string' || typeof operation.order_number !== 'string') throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  let checkout: AdminWebOrder['checkout'] = null
  if (operation.checkout !== null) {
    const sale = object(operation.checkout)
    if (sale.id !== row.cashier_sale_id || !Number.isSafeInteger(sale.total_cents) || sale.total_cents !== row.total_cents || typeof sale.folio !== 'string' || !['SENT_TO_CASHIER', 'PAYMENT_PENDING', 'PAID', 'DELIVERED', 'CANCELLED'].includes(String(sale.status))) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    checkout = { saleId: apiId(sale.id), folio: sale.folio, status: String(sale.status), totalCents: sale.total_cents as number }
  } else if (row.cashier_sale_id !== null) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return { serverTime: utc(operation.server_time), order: { id: String(row.id), orderNumber: operation.order_number, revision: row.revision,
    branch: { id: String(branch.id), code: branch.code, name: branch.name }, customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
    notes: row.notes, subtotalCents: row.subtotal_cents, discountCents: row.discount_cents, totalCents: row.total_cents, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, checkout,
    items: checked.items.map(item => ({ productId: String(item.product_id), name: item.product_name, code: item.internal_code, quantity: item.quantity,
      listPriceCents: item.list_price_cents, unitPriceCents: item.unit_price_cents, promotionName: item.promotion_name, lineTotalCents: item.line_total_cents })) } }
}
export function loadAdminWebOrders(signal?: AbortSignal): Promise<AdminWebOrdersResponse> {
  return request(async () => {
    const { token } = requireBackendAccess()
    const result = await createBackendAdminOrderService().list(token, { limit: 100 }, signal)
    const items: AdminWebOrder[] = []
    let serverTime: string | undefined
    // Bound concurrency to the API connection pool; each detail is scoped again on the server.
    for (const row of result.items) { const saved = await detail(row.id, signal); items.push(saved.order); serverTime = saved.serverTime }
    return { schemaVersion: 1, items, page: { limit: 100, hasMore: result.next_before_id !== null,
      nextCursor: result.next_before_id === null ? null : { id: String(result.next_before_id), createdAt: items.at(-1)!.createdAt } }, ...(serverTime ? { serverTime } : {}) }
  }, signal)
}
export function setAdminWebOrderStatus(orderId: string, nextStatus: WebOrderStatus, expectedRevision: number, signal?: AbortSignal): Promise<WebOrderStatusResult> {
  return request(async () => {
    const { token } = requireBackendAccess(), id = backendId(orderId)
    if (nextStatus === 'PENDING') throw new BackendAdminOrderError(400, 'WEB_ORDER_STATUS_INVALID')
    const result = await createBackendAdminOrderService().update(token, id, { status: nextStatus, expected_revision: expectedRevision, observation: null }, signal)
    const saved = await detail(id, signal)
    if (saved.order.status !== result.status || saved.order.revision !== result.revision) throw new BackendAdminOrderError(409, 'WEB_ORDER_VERSION_CONFLICT')
    return { schemaVersion: 1, orderId, status: saved.order.status, revision: result.revision, updatedAt: saved.order.updatedAt, idempotentReplay: result.idempotent_replay }
  }, signal)
}
export function sendWebOrderToCashier(orderId: string) {
  return request(async () => {
    const { token } = requireBackendAccess()
    const result = await createBackendAdminOrderService().sendToCashier(token, backendId(orderId))
    return { saleId: String(result.sale_id), folio: result.folio, status: result.status, totalCents: result.total_cents }
  })
}
