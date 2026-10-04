export type BackendPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER'
export interface BackendPaymentInput { claim_token: string; method: BackendPaymentMethod; amount_received_cents: number | null; reference: string | null }
export interface BackendPaymentAttempt { readonly key: string; readonly saleId: number; readonly cashierId: number; readonly branchId: number; readonly body: string }
const PAYMENT_STORAGE_KEY = 'viveroweb_backend_payment_attempt_v1'
export interface BackendCashierSale { id: number; folio: string; branch_id: number; web_order_id: number | null; status: string; subtotal_cents: number; discount_cents: number; total_cents: number }
export interface BackendPayment {
  id: number; sale_id: number; cashier_id: number; branch_id: number; claim_id: number; method: BackendPaymentMethod
  amount_due_cents: number; requested_amount_received_cents: number | null; amount_received_cents: number; change_cents: number
  reference: string | null; created_at: string
}
export interface BackendPaymentReceipt { schema_version: 1; idempotent_replay: boolean; sale: BackendCashierSale; payment: BackendPayment }
export class BackendCashierError extends Error {
  constructor(public readonly status: number, public readonly code = 'REQUEST_FAILED', public readonly resultUncertain = false) {
    const messages: Record<string, string> = {
      CLAIM_UNAVAILABLE: 'Otra persona tiene reservada esta venta.', CLAIM_EXPIRED: 'La reserva de cobro venció.',
      CLAIM_NOT_OWNED: 'La reserva no corresponde a tu sesión.', CLAIM_REQUIRED: 'Reserva la venta antes de cobrar.',
      CASH_AMOUNT_INSUFFICIENT: 'El efectivo recibido es insuficiente.', SALE_ALREADY_PAID: 'La venta ya fue cobrada. Recupera su resultado.',
      PAYMENT_IDEMPOTENCY_CONFLICT: 'Este intento pertenece a otro cobro. Recupera su resultado.',
      PAYMENT_NOT_FOUND: 'No se encontró un pago confirmado para este intento.',
      INVENTORY_INSUFFICIENT: 'No se registró el pago: faltan existencias en esta sucursal. Revisa el inventario antes de reintentar el mismo cobro.',
      SALE_STATUS_INVALID: 'La venta ya no permite esta operación. Actualiza el detalle.',
    }
    super(resultUncertain ? 'No se confirmó el resultado del cobro. Conserva el intento y recupera el pago.'
      : status === 401 ? 'La sesión ya no es válida.' : status === 403 ? 'No tienes permiso para operar Caja.'
        : messages[code] ?? 'No fue posible completar la operación de Caja.')
  }
}
function fail(): never { throw new BackendCashierError(502, 'INCOMPATIBLE_RESPONSE') }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail()
  return value as Record<string, unknown>
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail()
  return value
}
function id(value: unknown): number { return number(value, 1, 4294967295) }
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value }
function secret(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(); return value }
function date(value: unknown): string {
  const v = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v.slice(0, 23) + 'Z') fail()
  return v
}
function sale(value: unknown, expectedId: number): BackendCashierSale {
  const s = record(value, ['id', 'folio', 'branch_id', 'web_order_id', 'status', 'subtotal_cents', 'discount_cents', 'total_cents'])
  if (id(s.id) !== id(expectedId) || !['DRAFT', 'SENT_TO_CASHIER', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'DELIVERED'].includes(text(s.status))) fail()
  id(s.branch_id); text(s.folio); if (s.web_order_id !== null) id(s.web_order_id)
  if (BigInt(number(s.subtotal_cents, 1)) - BigInt(number(s.discount_cents)) !== BigInt(number(s.total_cents, 1))) fail()
  return s as unknown as BackendCashierSale
}
function paymentInput(value: unknown): BackendPaymentInput {
  const p = record(value, ['claim_token', 'method', 'amount_received_cents', 'reference'])
  secret(p.claim_token)
  if (!['CASH', 'CARD', 'TRANSFER'].includes(text(p.method))) fail()
  if (p.reference !== null) text(p.reference)
  if (p.method === 'CASH') { number(p.amount_received_cents, 1); if (p.reference !== null) fail() }
  else if (p.amount_received_cents !== null || (p.method === 'TRANSFER' && (p.reference === null || !text(p.reference).trim()))) fail()
  return p as unknown as BackendPaymentInput
}
export function createBackendPaymentAttempt(saleId: number, cashierId: number, branchId: number, input: BackendPaymentInput): BackendPaymentAttempt {
  const body = JSON.stringify(paymentInput(input)), bytes = crypto.getRandomValues(new Uint8Array(32))
  return Object.freeze({ key: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), saleId: id(saleId), cashierId: id(cashierId), branchId: id(branchId), body })
}
function attempt(value: BackendPaymentAttempt): BackendPaymentAttempt {
  record(value, ['key', 'saleId', 'cashierId', 'branchId', 'body']); secret(value.key); id(value.saleId); id(value.cashierId); id(value.branchId)
  let input: unknown
  try { input = JSON.parse(text(value.body)) } catch { fail() }
  paymentInput(input)
  return value
}
export function saveBackendPaymentAttempt(storage: Pick<Storage, 'setItem'>, saved: BackendPaymentAttempt): void {
  storage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify({ schema_version: 1, authority: 'backend-api', attempt: attempt(saved) }))
}
export function readBackendPaymentAttempt(storage: Pick<Storage, 'getItem'>, cashierId: number, branchId: number): BackendPaymentAttempt | null {
  const raw = storage.getItem(PAYMENT_STORAGE_KEY)
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { fail() }
  const r = record(parsed, ['schema_version', 'authority', 'attempt'])
  if (r.schema_version !== 1 || r.authority !== 'backend-api') fail()
  const saved = attempt(r.attempt as BackendPaymentAttempt)
  if (saved.cashierId !== id(cashierId) || saved.branchId !== id(branchId)) throw new BackendCashierError(403, 'PAYMENT_ATTEMPT_IDENTITY_MISMATCH')
  return Object.freeze({ ...saved })
}
export function clearBackendPaymentAttempt(storage: Pick<Storage, 'removeItem'>): void { storage.removeItem(PAYMENT_STORAGE_KEY) }
export function parseBackendPaymentReceipt(value: unknown, expected: Pick<BackendPaymentAttempt, 'saleId' | 'cashierId' | 'branchId'>): BackendPaymentReceipt {
  const root = record(value, ['schema_version', 'idempotent_replay', 'sale', 'payment']), checked = sale(root.sale, expected.saleId)
  const p = record(root.payment, ['id', 'sale_id', 'cashier_id', 'branch_id', 'claim_id', 'method', 'amount_due_cents', 'requested_amount_received_cents', 'amount_received_cents', 'change_cents', 'reference', 'created_at'])
  if (root.schema_version !== 1 || typeof root.idempotent_replay !== 'boolean' || checked.status !== 'PAID'
    || checked.branch_id !== id(expected.branchId) || id(p.sale_id) !== expected.saleId || id(p.cashier_id) !== id(expected.cashierId) || id(p.branch_id) !== expected.branchId) fail()
  id(p.id); id(p.claim_id); date(p.created_at)
  if (number(p.amount_due_cents, 1) !== checked.total_cents || BigInt(number(p.amount_received_cents, 1)) - BigInt(number(p.amount_due_cents, 1)) !== BigInt(number(p.change_cents))) fail()
  if (!['CASH', 'CARD', 'TRANSFER'].includes(text(p.method))) fail()
  if (p.reference !== null) text(p.reference)
  if (p.method === 'CASH') { if (p.requested_amount_received_cents !== p.amount_received_cents || p.reference !== null) fail() }
  else if (p.requested_amount_received_cents !== null || p.change_cents !== 0 || (p.method === 'TRANSFER' && (p.reference === null || !text(p.reference).trim()))) fail()
  return { schema_version: 1, idempotent_replay: root.idempotent_replay as boolean, sale: checked, payment: p as unknown as BackendPayment }
}
export function parseBackendCashierDetail(value: unknown, saleId: number, historical = false) {
  const r = record(value, ['schema_version', 'sale', 'items']), checked = sale(r.sale, saleId)
  if (r.schema_version !== 1 || !Array.isArray(r.items) || !r.items.length) fail()
  const items = r.items.map(v => {
    const i = record(v, ['id', 'product_id', 'product_name', 'internal_code', 'quantity', 'list_price_cents', 'unit_price_cents', 'line_total_cents'])
    // MariaDB DECIMAL quantities are strings; preserve three decimals exactly.
    const quantity = typeof i.quantity === 'number' ? String(i.quantity) : text(i.quantity)
    if (!/^\d+(?:\.\d{1,3})?$/.test(quantity)) fail()
    const [whole, fraction = ''] = quantity.split('.'), milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))
    if (milli <= 0n || milli > 99999999999999n || BigInt(number(i.unit_price_cents)) * milli !== BigInt(number(i.line_total_cents)) * 1000n || (i.list_price_cents === null && historical ? false : number(i.unit_price_cents) > number(i.list_price_cents))) fail()
    return { id: id(i.id), product_id: id(i.product_id), product_name: text(i.product_name), internal_code: i.internal_code === null && historical ? null : text(i.internal_code), quantity,
      list_price_cents: i.list_price_cents === null && historical ? null : number(i.list_price_cents), unit_price_cents: number(i.unit_price_cents), line_total_cents: number(i.line_total_cents) }
  })
  if (new Set(items.map(i => i.id)).size !== items.length || items.reduce((s, i) => s + BigInt(i.line_total_cents), 0n) !== BigInt(checked.web_order_id ? checked.total_cents : checked.subtotal_cents)) fail()
  return { schema_version: 1 as const, sale: checked, items }
}
export function parseBackendHistoricalReceipt(value: unknown, paymentId: number, identity: { userId: number; branchId: number }) {
  const r = record(value, ['schema_version', 'sale', 'payment', 'items', 'branch', 'refund'])
  const p = record(r.payment, ['id', 'sale_id', 'cashier_id', 'branch_id', 'method', 'amount_due_cents', 'amount_received_cents', 'change_cents', 'reference', 'created_at'])
  const detail = parseBackendCashierDetail({ schema_version: r.schema_version, sale: r.sale, items: r.items }, id(p.sale_id), true)
  const b = record(r.branch, ['id', 'name'])
  if (id(p.id) !== id(paymentId) || id(p.cashier_id) !== id(identity.userId) || id(p.branch_id) !== id(identity.branchId)
    || id(b.id) !== identity.branchId || detail.sale.branch_id !== identity.branchId || !['PAID', 'DELIVERED'].includes(detail.sale.status)
    || number(p.amount_due_cents, 1) !== detail.sale.total_cents || !['CASH', 'CARD', 'TRANSFER'].includes(text(p.method))) fail()
  date(p.created_at); text(b.name)
  if (BigInt(number(p.amount_received_cents, 1)) - BigInt(number(p.amount_due_cents, 1)) !== BigInt(number(p.change_cents))) fail()
  if (p.reference !== null) text(p.reference)
  if (p.method === 'CASH') { if (p.reference !== null) fail() }
  else if (p.change_cents !== 0 || (p.method === 'TRANSFER' && (p.reference === null || !text(p.reference).trim()))) fail()
  let refund: { id: number; amount_cents: number; method: BackendPaymentMethod } | null = null
  if (r.refund !== null) {
    const refunded = record(r.refund, ['id', 'amount_cents', 'method'])
    if (number(refunded.amount_cents, 1) !== p.amount_due_cents || !['CASH', 'CARD', 'TRANSFER'].includes(text(refunded.method))) fail()
    refund = { id: id(refunded.id), amount_cents: refunded.amount_cents as number, method: refunded.method as BackendPaymentMethod }
  }
  return { schema_version: 1 as const, sale: detail.sale, items: detail.items, branch: { id: id(b.id), name: text(b.name) }, refund,
    payment: { id: id(p.id), sale_id: id(p.sale_id), cashier_id: id(p.cashier_id), branch_id: id(p.branch_id), method: p.method as BackendPaymentMethod,
      amount_due_cents: p.amount_due_cents as number, amount_received_cents: p.amount_received_cents as number, change_cents: p.change_cents as number,
      reference: p.reference as string | null, created_at: date(p.created_at) } }
}
export function createBackendCashierService(request: typeof fetch = fetch) {
  async function call(token: string, path: string, method = 'GET', body?: string, key?: string, signal?: AbortSignal, resource = 'sales'): Promise<unknown> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new BackendCashierError(401)
    const timeout = AbortSignal.timeout(10000), writing = method !== 'GET'
    let response: Response
    try { response = await request(`/api/v1/cashier/${resource}${path}`, { method, body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': secret(key) } : {}) } }) }
    catch { throw new BackendCashierError(0, 'CONNECTION_FAILED', writing) }
    let value: unknown
    try { value = await response.json() } catch { throw new BackendCashierError(502, 'INCOMPATIBLE_RESPONSE', writing) }
    if (!response.ok) {
      const code = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' && /^[A-Z_]{3,64}$/.test(value.error) ? value.error : 'REQUEST_FAILED'
      throw new BackendCashierError(response.status, code, writing && response.status >= 500)
    }
    return value
  }
  return {
    async receipts(token: string, query: { limit?: number; beforeId?: number } = {}, signal?: AbortSignal) {
      const limit = number(query.limit ?? 50, 1, 100), params = new URLSearchParams({ limit: String(limit) })
      if (query.beforeId !== undefined) params.set('before_id', String(id(query.beforeId)))
      const r = record(await call(token, `?${params}`, 'GET', undefined, undefined, signal, 'receipts'), ['schema_version', 'items', 'next_before_id'])
      if (r.schema_version !== 1 || !Array.isArray(r.items) || r.items.length > limit) fail()
      const items = r.items.map(value => {
        const p = record(value, ['id', 'sale_id', 'folio', 'method', 'amount_due_cents', 'created_at'])
        if (!['CASH', 'CARD', 'TRANSFER'].includes(text(p.method))) fail()
        return { id: id(p.id), sale_id: id(p.sale_id), folio: text(p.folio), method: p.method as BackendPaymentMethod, amount_due_cents: number(p.amount_due_cents, 1), created_at: date(p.created_at) }
      })
      if (items.some((p, i) => (i > 0 && p.id >= items[i - 1].id) || (query.beforeId !== undefined && p.id >= query.beforeId))) fail()
      if (r.next_before_id !== null && (id(r.next_before_id) !== items.at(-1)?.id || items.length !== limit)) fail()
      return { schema_version: 1 as const, items, next_before_id: r.next_before_id as number | null }
    },
    async receipt(token: string, paymentId: number, identity: { userId: number; branchId: number }, signal?: AbortSignal) {
      return parseBackendHistoricalReceipt(await call(token, `/${id(paymentId)}`, 'GET', undefined, undefined, signal, 'receipts'), paymentId, identity)
    },
    async list(token: string, query: { limit?: number; beforeId?: number } = {}, signal?: AbortSignal) {
      const limit = number(query.limit ?? 50, 1, 100), params = new URLSearchParams({ limit: String(limit) })
      if (query.beforeId !== undefined) params.set('before_id', String(id(query.beforeId)))
      const r = record(await call(token, `?${params}`, 'GET', undefined, undefined, signal), ['schema_version', 'items', 'next_before_id'])
      if (r.schema_version !== 1 || !Array.isArray(r.items) || r.items.length > limit) fail()
      const items = r.items.map(v => {
        const s = record(v, ['id', 'folio', 'created_by', 'status', 'total_cents', 'created_at'])
        if (s.status !== 'SENT_TO_CASHIER') fail()
        return { id: id(s.id), folio: text(s.folio), created_by: id(s.created_by), status: 'SENT_TO_CASHIER' as const, total_cents: number(s.total_cents, 1), created_at: date(s.created_at) }
      })
      if (items.some((s, i) => (i > 0 && s.id >= items[i - 1].id) || (query.beforeId !== undefined && s.id >= query.beforeId))) fail()
      if (r.next_before_id !== null && (id(r.next_before_id) !== items.at(-1)?.id || items.length !== limit)) fail()
      return { schema_version: 1 as const, items, next_before_id: r.next_before_id as number | null }
    },
    async detail(token: string, saleId: number, signal?: AbortSignal) {
      return parseBackendCashierDetail(await call(token, `/${id(saleId)}`, 'GET', undefined, undefined, signal), saleId)
    },
    async claim(token: string, saleId: number, claimToken: string | null = null, signal?: AbortSignal) {
      if (claimToken !== null) secret(claimToken)
      const r = record(await call(token, `/${id(saleId)}/claim`, 'POST', JSON.stringify({ claim_token: claimToken }), undefined, signal), ['schema_version', 'sale_id', 'branch_id', 'cashier_id', 'claim_token', 'created_at', 'expires_at', 'server_time', 'renewed'])
      if (r.schema_version !== 1 || id(r.sale_id) !== saleId || typeof r.renewed !== 'boolean') fail()
      const result = { schema_version: 1 as const, sale_id: saleId, branch_id: id(r.branch_id), cashier_id: id(r.cashier_id), claim_token: secret(r.claim_token), created_at: date(r.created_at), expires_at: date(r.expires_at), server_time: date(r.server_time), renewed: r.renewed as boolean }
      if (Date.parse(result.expires_at) <= Date.parse(result.created_at)) fail()
      return result
    },
    async release(token: string, saleId: number, claimToken: string, signal?: AbortSignal) {
      const value = await call(token, `/${id(saleId)}/release`, 'POST', JSON.stringify({ claim_token: secret(claimToken) }), undefined, signal)
      const extended = Boolean(value && typeof value === 'object' && 'released_at' in value)
      const r = record(value, extended ? ['schema_version', 'sale_id', 'closed_reason', 'claim_token', 'released_at'] : ['schema_version', 'sale_id', 'closed_reason'])
      if (r.schema_version !== 1 || id(r.sale_id) !== saleId || !['RELEASED', 'EXPIRED'].includes(text(r.closed_reason))) fail()
      if (extended && (secret(r.claim_token) !== claimToken || !date(r.released_at))) fail()
      return { schema_version: 1 as const, sale_id: saleId, closed_reason: text(r.closed_reason) }
    },
    async pay(token: string, saved: BackendPaymentAttempt, signal?: AbortSignal) {
      const checked = attempt(saved), result = await call(token, `/${checked.saleId}/payments`, 'POST', checked.body, checked.key, signal)
      try {
        const receipt = parseBackendPaymentReceipt(result, checked), input = paymentInput(JSON.parse(checked.body))
        if (receipt.payment.method !== input.method || receipt.payment.requested_amount_received_cents !== input.amount_received_cents || receipt.payment.reference !== (input.reference?.trim() || null)) fail()
        return receipt
      } catch { throw new BackendCashierError(502, 'INCOMPATIBLE_RESPONSE', true) }
    },
    async recover(token: string, saved: BackendPaymentAttempt, signal?: AbortSignal) {
      const checked = attempt(saved)
      const receipt = parseBackendPaymentReceipt(await call(token, `/${checked.saleId}/payment-result`, 'POST', '{}', checked.key, signal), checked)
      const input = paymentInput(JSON.parse(checked.body))
      if (receipt.payment.method !== input.method || receipt.payment.requested_amount_received_cents !== input.amount_received_cents || receipt.payment.reference !== (input.reference?.trim() || null)) fail()
      return receipt
    },
  }
}
