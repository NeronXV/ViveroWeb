import { WEB_ORDER_STATUSES, type WebOrderStatus } from './web-order-types'

export interface BackendOrderInput {
  branch_id: number
  items: Array<{ product_id: number; quantity: number }>
}
export interface BackendOrderSubmission extends BackendOrderInput {
  customer_name: string; customer_phone: string | null; customer_email: string | null
  notes: string | null; expected_total_cents: number
}
export interface BackendOrderQuote {
  schema_version: 1; branch_id: number; subtotal_cents: number; discount_cents: number; total_cents: number
  items: Array<{ product_id: number; product_name: string; internal_code: string; quantity: number
    list_price_cents: number; unit_price_cents: number; promotion_id: number | null
    promotion_name: string | null; line_total_cents: number }>
}
export interface BackendOrderReceipt {
  schema_version: 1; id: number; order_number: string; status: WebOrderStatus
  total_cents: number; created_at: string; idempotent_replay: boolean
}
export interface BackendOrderAttempt { readonly key: string; readonly body: string }
const ATTEMPT_STORAGE_KEY = 'viveroweb_backend_order_attempt_v1'

const messages: Record<string, string> = {
  WEB_ORDER_PRICE_CHANGED: 'El precio cambió. Solicita una nueva cotización antes de confirmar.',
  WEB_ORDER_BRANCH_UNAVAILABLE: 'La sucursal seleccionada ya no está disponible.',
  WEB_ORDER_ITEMS_UNAVAILABLE: 'Uno de los productos ya no está disponible.',
  WEB_ORDER_RATE_LIMITED: 'Espera unos minutos antes de enviar otro pedido.',
  WEB_ORDER_IDEMPOTENCY_CONFLICT: 'Este intento ya pertenece a otro contenido. Recupera su resultado.',
  WEB_ORDER_NOT_FOUND: 'No se encontró un pedido confirmado para este intento.',
}
export class BackendOrderError extends Error {
  constructor(public readonly code: string, public readonly resultUncertain = false) {
    super(resultUncertain ? 'No se pudo confirmar el resultado. Conserva el intento y recupera el pedido.'
      : messages[code] ?? 'No fue posible completar la operación de pedido.')
  }
}
function fail(): never { throw new BackendOrderError('INCOMPATIBLE_RESPONSE') }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(k => !Object.hasOwn(value, k))) fail()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail()
  return value
}
function id(value: unknown): number { return integer(value, 1, 4294967295) }
function text(value: unknown): string { if (typeof value !== 'string') fail(); return value }
function key(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(); return value }
function orderInput(value: unknown, maximumQuantity = 100): BackendOrderInput {
  const input = record(value, ['branch_id', 'items'])
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 25) fail()
  const items = input.items.map(item => {
    const row = record(item, ['product_id', 'quantity'])
    return { product_id: id(row.product_id), quantity: integer(row.quantity, 1, maximumQuantity) }
  }).sort((a, b) => a.product_id - b.product_id)
  if (new Set(items.map(i => i.product_id)).size !== items.length) fail()
  return { branch_id: id(input.branch_id), items }
}
function submission(value: unknown): BackendOrderSubmission {
  const input = record(value, ['branch_id', 'items', 'customer_name', 'customer_phone', 'customer_email', 'notes', 'expected_total_cents'])
  // Server remains authority for contact validation and current prices.
  const nullable = (v: unknown) => v === null ? null : text(v)
  return { ...orderInput({ branch_id: input.branch_id, items: input.items }), customer_name: text(input.customer_name),
    customer_phone: nullable(input.customer_phone), customer_email: nullable(input.customer_email), notes: nullable(input.notes),
    expected_total_cents: integer(input.expected_total_cents, 1) }
}
export function createBackendOrderAttempt(input: BackendOrderSubmission): BackendOrderAttempt {
  const body = JSON.stringify(submission(input))
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Object.freeze({ key: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), body })
}
function validateAttempt(value: unknown): BackendOrderAttempt {
  const attempt = record(value, ['key', 'body'])
  key(attempt.key)
  const body = text(attempt.body)
  let input: unknown
  try { input = JSON.parse(body) } catch { fail() }
  submission(input)
  return Object.freeze({ key: attempt.key as string, body })
}
// Caller saves successfully before POST. Failure must stop sending, never replace the key.
export function saveBackendOrderAttempt(storage: Pick<Storage, 'setItem'>, attempt: BackendOrderAttempt): void {
  storage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify({ schema_version: 1, authority: 'backend-api', attempt: validateAttempt(attempt) }))
}
export function readBackendOrderAttempt(storage: Pick<Storage, 'getItem'>): BackendOrderAttempt | null {
  const raw = storage.getItem(ATTEMPT_STORAGE_KEY)
  if (raw === null) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { fail() }
  const saved = record(value, ['schema_version', 'authority', 'attempt'])
  if (saved.schema_version !== 1 || saved.authority !== 'backend-api') fail()
  return validateAttempt(saved.attempt)
}
export function clearBackendOrderAttempt(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(ATTEMPT_STORAGE_KEY)
}
export function parseBackendOrderReceipt(value: unknown): BackendOrderReceipt {
  const r = record(value, ['schema_version', 'id', 'order_number', 'status', 'total_cents', 'created_at', 'idempotent_replay'])
  if (r.schema_version !== 1 || r.order_number !== `VW-${id(r.id)}` || !WEB_ORDER_STATUSES.some(s => s === r.status)
    || typeof r.idempotent_replay !== 'boolean' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(text(r.created_at))
    || !Number.isFinite(Date.parse(text(r.created_at)))
    || new Date(text(r.created_at)).toISOString() !== text(r.created_at).slice(0, 23) + 'Z') fail()
  integer(r.total_cents, 1)
  return r as unknown as BackendOrderReceipt
}
export function parseBackendOrderQuote(value: unknown, expected: BackendOrderInput, maximumQuantity: 100 | 100000 = 100): BackendOrderQuote {
  const q = record(value, ['schema_version', 'branch_id', 'subtotal_cents', 'discount_cents', 'total_cents', 'items'])
  const input = orderInput(expected, maximumQuantity)
  if (q.schema_version !== 1 || id(q.branch_id) !== input.branch_id || !Array.isArray(q.items) || q.items.length !== input.items.length) fail()
  let subtotal = 0n, total = 0n
  const seen = new Set<number>()
  for (const item of q.items) {
    const row = record(item, ['product_id', 'product_name', 'internal_code', 'quantity', 'list_price_cents', 'unit_price_cents', 'promotion_id', 'promotion_name', 'line_total_cents'])
    const productId = id(row.product_id), quantity = integer(row.quantity, 1, maximumQuantity)
    if (seen.has(productId) || !input.items.some(i => i.product_id === productId && i.quantity === quantity)) fail()
    seen.add(productId); text(row.product_name); text(row.internal_code)
    const list = integer(row.list_price_cents), unit = integer(row.unit_price_cents)
    if (unit > list || BigInt(integer(row.line_total_cents)) !== BigInt(unit) * BigInt(quantity)) fail()
    if (row.promotion_id === null) { if (row.promotion_name !== null || unit !== list) fail() }
    else { id(row.promotion_id); text(row.promotion_name); if (unit === list) fail() }
    subtotal += BigInt(list) * BigInt(quantity); total += BigInt(unit) * BigInt(quantity)
  }
  if (BigInt(integer(q.subtotal_cents)) !== subtotal || BigInt(integer(q.total_cents, 1)) !== total
    || BigInt(integer(q.discount_cents)) !== subtotal - total) fail()
  return q as unknown as BackendOrderQuote
}
export function createBackendOrderService(request: typeof fetch = fetch) {
  async function call(path: string, method: string, body?: string, recoveryKey?: string, signal?: AbortSignal, writing = false): Promise<unknown> {
    const timeout = AbortSignal.timeout(10000)
    let response: Response
    try {
      response = await request(`/api/v1/web-orders${path}`, { method, body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(recoveryKey ? { 'Idempotency-Key': key(recoveryKey) } : {}) } })
    } catch { throw new BackendOrderError('CONNECTION_FAILED', writing) }
    let value: unknown
    try { value = await response.json() } catch { throw new BackendOrderError('INCOMPATIBLE_RESPONSE', writing) }
    if (!response.ok) {
      const code = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'REQUEST_FAILED'
      throw new BackendOrderError(Object.hasOwn(messages, code) ? code : 'REQUEST_FAILED', writing && (response.status >= 500 || !Object.hasOwn(messages, code)))
    }
    return value
  }
  return {
    async options(signal?: AbortSignal) {
      const result = record(await call('/options', 'GET', undefined, undefined, signal), ['schema_version', 'branches'])
      if (result.schema_version !== 1 || !Array.isArray(result.branches)) fail()
      const branches = result.branches.map(b => { const row = record(b, ['id', 'code', 'name']); return { id: id(row.id), code: text(row.code), name: text(row.name) } })
      if (new Set(branches.map(b => b.id)).size !== branches.length) fail()
      return { schema_version: 1 as const, branches }
    },
    async quote(input: BackendOrderInput, signal?: AbortSignal) {
      const checked = orderInput(input)
      return parseBackendOrderQuote(await call('/quote', 'POST', JSON.stringify(checked), undefined, signal), checked)
    },
    async submit(attempt: BackendOrderAttempt, signal?: AbortSignal) {
      const checked = validateAttempt(attempt)
      const result = await call('', 'POST', checked.body, checked.key, signal, true)
      try {
        const receipt = parseBackendOrderReceipt(result)
        if (receipt.total_cents !== submission(JSON.parse(checked.body)).expected_total_cents) fail()
        return receipt
      } catch { throw new BackendOrderError('INCOMPATIBLE_RESPONSE', true) }
    },
    async recover(recoveryKey: string, signal?: AbortSignal) {
      key(recoveryKey)
      return parseBackendOrderReceipt(await call('/recover', 'POST', '{}', recoveryKey, signal))
    },
  }
}
