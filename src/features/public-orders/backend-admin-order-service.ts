import { WEB_ORDER_STATUSES, type WebOrderStatus } from './web-order-types'

export interface BackendAdminOrder {
  id: number; branch_id: number; customer_name: string; customer_phone: string | null
  customer_email: string | null; notes: string | null; status: WebOrderStatus; revision: number
  cashier_sale_id: number | null; subtotal_cents: number; discount_cents: number; total_cents: number
  created_at: string; updated_at: string
}
export interface BackendAdminOrderItem {
  id: number; product_id: number; product_name: string; internal_code: string; quantity: number
  list_price_cents: number; unit_price_cents: number; discount_cents: number; line_total_cents: number
  promotion_id: number | null; promotion_name: string | null
}
export interface BackendOrderHistory {
  revision: number; previous_status: WebOrderStatus | null; new_status: WebOrderStatus
  changed_by: number | null; observation: string | null; changed_at: string
}
export interface BackendAdminOrderDetail { schema_version: 1; order: BackendAdminOrder; items: BackendAdminOrderItem[]; history: BackendOrderHistory[] }
export interface BackendAdminOrderQuery { limit?: number; beforeId?: number; branchId?: number; status?: WebOrderStatus }
export interface BackendOrderStatusInput { status: Exclude<WebOrderStatus, 'PENDING'>; expected_revision: number; observation: string | null }
const safeMessages: Record<string, string> = {
  WEB_ORDER_VERSION_CONFLICT: 'El pedido cambió. Actualiza el detalle antes de continuar.',
  WEB_ORDER_PAYMENT_REQUIRED: 'Primero cobra la venta en Caja; después podrás completar la entrega.',
  WEB_ORDER_ALREADY_IN_CASHIER: 'El pedido ya está en Caja y no se puede cancelar aquí.',
  WEB_ORDER_STATUS_INVALID: 'Ese cambio de estado no está permitido. Actualiza el detalle.',
  WEB_ORDER_ITEMS_UNAVAILABLE: 'Uno de los productos ya no está disponible.',
  WEB_ORDER_NOT_FOUND: 'El pedido no está disponible para tu sesión.',
}
export class BackendAdminOrderError extends Error {
  constructor(public readonly status: number, public readonly code = 'REQUEST_FAILED', public readonly resultUncertain = false) {
    super(resultUncertain ? 'No se confirmó el resultado. Actualiza el pedido antes de repetir la acción.'
      : status === 401 ? 'La sesión ya no es válida. Inicia sesión nuevamente.'
        : status === 403 ? 'No tienes permiso para realizar esta operación.'
          : safeMessages[code] ?? 'No fue posible completar la operación de pedido.')
  }
}
function fail(): never { throw new BackendAdminOrderError(502, 'INCOMPATIBLE_RESPONSE') }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail()
  return value
}
function id(value: unknown): number { return integer(value, 1, 4294967295) }
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value }
function nullableText(value: unknown): string | null { return value === null ? null : text(value) }
function date(value: unknown): string {
  const v = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v.slice(0, 23) + 'Z') fail()
  return v
}
function state(value: unknown): WebOrderStatus { if (!WEB_ORDER_STATUSES.some(s => s === value)) fail(); return value as WebOrderStatus }
function order(value: unknown): BackendAdminOrder {
  const r = record(value, ['id', 'branch_id', 'customer_name', 'customer_phone', 'customer_email', 'notes', 'status', 'revision', 'cashier_sale_id',
    'subtotal_cents', 'discount_cents', 'total_cents', 'created_at', 'updated_at'])
  id(r.id); id(r.branch_id); text(r.customer_name); nullableText(r.customer_phone); nullableText(r.customer_email); nullableText(r.notes)
  state(r.status); integer(r.revision, 0, 4294967295); if (r.cashier_sale_id !== null) id(r.cashier_sale_id)
  if (BigInt(integer(r.subtotal_cents, 1)) - BigInt(integer(r.discount_cents)) !== BigInt(integer(r.total_cents, 1))) fail()
  date(r.created_at); date(r.updated_at)
  return r as unknown as BackendAdminOrder
}
export function parseBackendAdminOrderDetail(value: unknown, expectedId: number): BackendAdminOrderDetail {
  const r = record(value, ['schema_version', 'order', 'items', 'history']), checked = order(r.order)
  if (r.schema_version !== 1 || checked.id !== id(expectedId) || !Array.isArray(r.items) || r.items.length < 1 || r.items.length > 25 || !Array.isArray(r.history)) fail()
  const items = r.items.map(value => {
    const i = record(value, ['id', 'product_id', 'product_name', 'internal_code', 'quantity', 'list_price_cents', 'unit_price_cents', 'discount_cents', 'line_total_cents', 'promotion_id', 'promotion_name'])
    id(i.id); id(i.product_id); text(i.product_name); text(i.internal_code)
    const quantity = BigInt(integer(i.quantity, 1, 100)), list = BigInt(integer(i.list_price_cents)), unit = BigInt(integer(i.unit_price_cents))
    if (unit > list || (list - unit) * quantity !== BigInt(integer(i.discount_cents)) || unit * quantity !== BigInt(integer(i.line_total_cents))) fail()
    if (i.promotion_id === null) { if (i.promotion_name !== null || list !== unit) fail() }
    else { id(i.promotion_id); text(i.promotion_name); if (list === unit) fail() }
    return i as unknown as BackendAdminOrderItem
  })
  if (new Set(items.map(i => i.id)).size !== items.length || new Set(items.map(i => i.product_id)).size !== items.length
    || items.reduce((sum, i) => sum + BigInt(i.list_price_cents) * BigInt(i.quantity), 0n) !== BigInt(checked.subtotal_cents)
    || items.reduce((sum, i) => sum + BigInt(i.line_total_cents), 0n) !== BigInt(checked.total_cents)) fail()
  const history = r.history.map((value, index) => {
    const h = record(value, ['revision', 'previous_status', 'new_status', 'changed_by', 'observation', 'changed_at'])
    if (integer(h.revision, 0, 4294967295) !== index) fail()
    if (h.previous_status !== null) state(h.previous_status)
    state(h.new_status); if (h.changed_by !== null) id(h.changed_by)
    nullableText(h.observation); date(h.changed_at)
    return h as unknown as BackendOrderHistory
  })
  if (history.length !== checked.revision + 1 || history[0]?.previous_status !== null || history[0]?.new_status !== 'PENDING'
    || history.some((h, i) => i > 0 && h.previous_status !== history[i - 1].new_status) || history.at(-1)?.new_status !== checked.status) fail()
  return { schema_version: 1, order: checked, items, history }
}
export function createBackendAdminOrderService(request: typeof fetch = fetch) {
  async function call(token: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new BackendAdminOrderError(401)
    const timeout = AbortSignal.timeout(10000), writing = method !== 'GET'
    let response: Response
    try { response = await request(`/api/v1/admin/web-orders${path}`, { method, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) }) }
    catch { throw new BackendAdminOrderError(0, 'CONNECTION_FAILED', writing) }
    let value: unknown
    try { value = await response.json() } catch { throw new BackendAdminOrderError(502, 'INCOMPATIBLE_RESPONSE', writing) }
    if (!response.ok) {
      const code = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'REQUEST_FAILED'
      throw new BackendAdminOrderError(response.status, Object.hasOwn(safeMessages, code) ? code : 'REQUEST_FAILED', writing && response.status >= 500)
    }
    return value
  }
  return {
    async list(token: string, query: BackendAdminOrderQuery = {}, signal?: AbortSignal) {
      const limit = integer(query.limit ?? 50, 1, 100), params = new URLSearchParams({ limit: String(limit) })
      if (query.beforeId !== undefined) params.set('before_id', String(id(query.beforeId)))
      if (query.branchId !== undefined) params.set('branch_id', String(id(query.branchId)))
      if (query.status !== undefined) params.set('status', state(query.status))
      const r = record(await call(token, `?${params}`, 'GET', undefined, signal), ['schema_version', 'items', 'next_before_id'])
      if (r.schema_version !== 1 || !Array.isArray(r.items) || r.items.length > limit) fail()
      const items = r.items.map(order)
      if (items.some((o, i) => (i > 0 && o.id >= items[i - 1].id) || (query.beforeId !== undefined && o.id >= query.beforeId)
        || (query.branchId !== undefined && o.branch_id !== query.branchId) || (query.status !== undefined && o.status !== query.status))) fail()
      if (r.next_before_id !== null && (id(r.next_before_id) !== items.at(-1)?.id || items.length !== limit)) fail()
      return { schema_version: 1 as const, items, next_before_id: r.next_before_id as number | null }
    },
    async detail(token: string, orderId: number, signal?: AbortSignal) {
      return parseBackendAdminOrderDetail(await call(token, `/${id(orderId)}`, 'GET', undefined, signal), orderId)
    },
    async update(token: string, orderId: number, input: BackendOrderStatusInput, signal?: AbortSignal) {
      const checked = record(input, ['status', 'expected_revision', 'observation'])
      if (state(checked.status) === 'PENDING') fail()
      integer(checked.expected_revision, 0, 4294967294); nullableText(checked.observation)
      const result = await call(token, `/${id(orderId)}`, 'PATCH', checked, signal)
      try {
        const r = record(result, ['id', 'status', 'revision', 'idempotent_replay'])
        if (id(r.id) !== orderId || state(r.status) !== input.status || integer(r.revision) !== input.expected_revision + 1 || typeof r.idempotent_replay !== 'boolean') fail()
        return { id: orderId, status: input.status, revision: r.revision as number, idempotent_replay: r.idempotent_replay as boolean }
      } catch { throw new BackendAdminOrderError(502, 'INCOMPATIBLE_RESPONSE', true) }
    },
    async sendToCashier(token: string, orderId: number, signal?: AbortSignal) {
      const result = await call(token, `/${id(orderId)}/send-to-cashier`, 'POST', {}, signal)
      try {
        const r = record(result, ['schema_version', 'order_id', 'sale_id', 'folio', 'status', 'total_cents', 'idempotent_replay'])
        if (r.schema_version !== 1 || id(r.order_id) !== orderId || !['SENT_TO_CASHIER', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'DELIVERED'].includes(text(r.status)) || typeof r.idempotent_replay !== 'boolean') fail()
        return { schema_version: 1 as const, order_id: orderId, sale_id: id(r.sale_id), folio: text(r.folio), status: text(r.status), total_cents: integer(r.total_cents, 1), idempotent_replay: r.idempotent_replay as boolean }
      } catch { throw new BackendAdminOrderError(502, 'INCOMPATIBLE_RESPONSE', true) }
    },
  }
}
