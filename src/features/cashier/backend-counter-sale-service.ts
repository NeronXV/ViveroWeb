import { parseBackendOrderQuote } from '../public-orders/backend-order-service'
import { parseBackendProduct } from '../public-catalog/backend-catalog-service'

export interface BackendCounterInput { items: Array<{ product_id: number; quantity: number }>; expected_total_cents: number; customer_id?: number | null }
export interface BackendCounterAttempt { readonly key: string; readonly userId: number; readonly branchId: number; readonly body: string }
export interface BackendCounterReceipt { schema_version: 1; id: number; folio: string; branch_id: number; created_by: number; status: string; subtotal_cents: number; discount_cents: number; total_cents: number; created_at: string; idempotent_replay: boolean }
export class BackendCounterError extends Error {
  constructor(public readonly status: number, public readonly code = 'REQUEST_FAILED', public readonly resultUncertain = false) {
    super(resultUncertain ? 'No se confirmó la venta. Conserva el intento y recupera su resultado.'
      : code === 'SALE_PRICE_CHANGED' ? 'El precio cambió. Solicita una nueva cotización.'
        : code === 'PRODUCT_SCAN_CODE_AMBIGUOUS' ? 'Hay varios productos con ese código. Pide revisar el catálogo.'
        : code === 'PENDING_ATTEMPT' ? 'Hay una venta pendiente de recuperar para esta sesión y sucursal.'
          : status === 401 ? 'La sesión ya no es válida.' : status === 403 ? 'No tienes permiso para crear ventas en esta sucursal.'
            : 'No fue posible completar la operación de venta.')
  }
}
function fail(): never { throw new BackendCounterError(502, 'INCOMPATIBLE_RESPONSE') }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail()
  return value as Record<string, unknown>
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail()
  return value
}
function id(value: unknown): number { return integer(value, 1, 4294967295) }
function secret(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(); return value }
function lines(value: unknown): BackendCounterInput['items'] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) fail()
  const items = value.map(v => { const i = record(v, ['product_id', 'quantity']); return { product_id: id(i.product_id), quantity: integer(i.quantity, 1, 100000) } }).sort((a, b) => a.product_id - b.product_id)
  if (new Set(items.map(i => i.product_id)).size !== items.length) fail()
  return items
}
function input(value: unknown): BackendCounterInput {
  const hasCustomer = value !== null && typeof value === 'object' && Object.hasOwn(value, 'customer_id')
  const r = record(value, ['items', 'expected_total_cents', ...(hasCustomer ? ['customer_id'] : [])])
  return { items: lines(r.items), expected_total_cents: integer(r.expected_total_cents, 1), ...(hasCustomer ? { customer_id: r.customer_id === null ? null : id(r.customer_id) } : {}) }
}
function attempt(value: unknown): BackendCounterAttempt {
  const r = record(value, ['key', 'userId', 'branchId', 'body'])
  if (typeof r.body !== 'string') fail()
  let parsed: unknown
  try { parsed = JSON.parse(r.body) } catch { fail() }
  input(parsed)
  return Object.freeze({ key: secret(r.key), userId: id(r.userId), branchId: id(r.branchId), body: r.body })
}
export function createBackendCounterAttempt(userId: number, branchId: number, value: BackendCounterInput): BackendCounterAttempt {
  const bytes = crypto.getRandomValues(new Uint8Array(32)), body = JSON.stringify(input(value))
  return Object.freeze({ key: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), userId: id(userId), branchId: id(branchId), body })
}
const storageKey = (userId: number, branchId: number) => `viveroweb_backend_counter_attempt_v1:${id(userId)}:${id(branchId)}`
export function readBackendCounterAttempt(storage: Pick<Storage, 'getItem'>, userId: number, branchId: number): BackendCounterAttempt | null {
  const raw = storage.getItem(storageKey(userId, branchId))
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { fail() }
  const r = record(parsed, ['schema_version', 'authority', 'attempt'])
  if (r.schema_version !== 1 || r.authority !== 'backend-api') fail()
  const saved = attempt(r.attempt)
  if (saved.userId !== userId || saved.branchId !== branchId) fail()
  return saved
}
export function finishBackendCounterAttempt(storage: Pick<Storage, 'getItem' | 'removeItem'>, value: BackendCounterAttempt): void {
  const checked = attempt(value), pending = readBackendCounterAttempt(storage, checked.userId, checked.branchId)
  if (pending?.key === checked.key && pending.body === checked.body) storage.removeItem(storageKey(checked.userId, checked.branchId))
}
export function parseBackendCounterReceipt(value: unknown, expected: BackendCounterAttempt): BackendCounterReceipt {
  const r = record(value, ['schema_version', 'id', 'folio', 'branch_id', 'created_by', 'status', 'subtotal_cents', 'discount_cents', 'total_cents', 'created_at', 'idempotent_replay'])
  const checked = attempt(expected)
  if (r.schema_version !== 1 || id(r.created_by) !== checked.userId || id(r.branch_id) !== checked.branchId || typeof r.idempotent_replay !== 'boolean'
    || typeof r.folio !== 'string' || !/^VD-[A-F0-9]{24}$/.test(r.folio) || !['SENT_TO_CASHIER', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'DELIVERED'].includes(String(r.status))
    || typeof r.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.created_at) || !Number.isFinite(Date.parse(r.created_at))
    || new Date(r.created_at).toISOString() !== r.created_at.slice(0, -1) + '.000Z') fail()
  id(r.id)
  if (integer(r.discount_cents) !== 0 || integer(r.subtotal_cents, 1) !== integer(r.total_cents, 1) || r.total_cents !== input(JSON.parse(checked.body)).expected_total_cents) fail()
  return r as unknown as BackendCounterReceipt
}
type Exclusive = <T>(name: string, action: () => Promise<T>) => Promise<T>
const browserExclusive: Exclusive = async (name, action) => {
  if (!navigator.locks) throw new BackendCounterError(0, 'BROWSER_LOCK_REQUIRED')
  return navigator.locks.request(name, action)
}
export function createBackendCounterSaleService(request: typeof fetch = fetch, exclusive: Exclusive = browserExclusive) {
  async function call(token: string, path: string, body: string, key?: string, signal?: AbortSignal, identity?: { userId?: number; branchId: number }): Promise<unknown> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new BackendCounterError(401)
    let response: Response
    const timeout = AbortSignal.timeout(15000), writing = path !== '/quote' && path !== '/recover'
    try { response = await request(`/api/v1/sales${path}`, { method: 'POST', body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': secret(key) } : {}),
        ...(identity ? { 'X-Expected-Branch-Id': String(id(identity.branchId)), ...(identity.userId !== undefined ? { 'X-Expected-Actor-Id': String(id(identity.userId)) } : {}) } : {}) } }) }
    catch { throw new BackendCounterError(0, 'CONNECTION_FAILED', writing) }
    let value: unknown
    try { value = await response.json() } catch { throw new BackendCounterError(502, 'INCOMPATIBLE_RESPONSE', writing) }
    if (!response.ok) {
      const code = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' && /^[A-Z_]{3,64}$/.test(value.error) ? value.error : 'REQUEST_FAILED'
      throw new BackendCounterError(response.status, code, writing && response.status >= 500)
    }
    return value
  }
  return {
    async scan(token: string, code: string, signal?: AbortSignal) {
      if (typeof code !== 'string' || [...code.trim()].length < 2 || [...code.trim()].length > 128
        || [...code].some(c => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159))) fail()
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new BackendCounterError(401)
      const timeout = AbortSignal.timeout(10000)
      let response: Response
      try { response = await request('/api/v1/products/scan', { method: 'POST', body: JSON.stringify({ code: code.trim() }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }) }
      catch { throw new BackendCounterError(0, 'CONNECTION_FAILED') }
      let value: unknown
      try { value = await response.json() } catch { fail() }
      if (!response.ok) {
        const ambiguous = value && typeof value === 'object' && 'error' in value && value.error === 'PRODUCT_SCAN_CODE_AMBIGUOUS'
        throw new BackendCounterError(response.status, ambiguous ? 'PRODUCT_SCAN_CODE_AMBIGUOUS' : 'REQUEST_FAILED')
      }
      const result = record(value, ['schema_version', 'item'])
      if (result.schema_version !== 1) fail()
      return result.item === null ? null : parseBackendProduct(result.item)
    },
    async quote(token: string, branchId: number, items: BackendCounterInput['items'], signal?: AbortSignal) {
      const checked = lines(items), result = await call(token, '/quote', JSON.stringify({ items: checked }), undefined, signal, { branchId })
      return parseBackendOrderQuote(result, { branch_id: id(branchId), items: checked }, 100000)
    },
    async submit(token: string, saved: BackendCounterAttempt, storage: Pick<Storage, 'getItem' | 'setItem'>, signal?: AbortSignal) {
      const checked = attempt(saved)
      return exclusive(storageKey(checked.userId, checked.branchId), async () => {
        const pending = readBackendCounterAttempt(storage, checked.userId, checked.branchId)
        if (pending && (pending.key !== checked.key || pending.body !== checked.body)) throw new BackendCounterError(409, 'PENDING_ATTEMPT')
        storage.setItem(storageKey(checked.userId, checked.branchId), JSON.stringify({ schema_version: 1, authority: 'backend-api', attempt: checked }))
        const reread = readBackendCounterAttempt(storage, checked.userId, checked.branchId)
        if (!reread || reread.key !== checked.key || reread.body !== checked.body) throw new BackendCounterError(0, 'STORAGE_FAILED')
        const result = await call(token, '', checked.body, checked.key, signal, checked)
        try { return parseBackendCounterReceipt(result, checked) } catch { throw new BackendCounterError(502, 'INCOMPATIBLE_RESPONSE', true) }
      })
    },
    async retire(token: string, saved: BackendCounterAttempt, signal?: AbortSignal) {
      const checked = attempt(saved)
      const r = record(await call(token, '/retire', '{}', checked.key, signal, checked), ['schema_version', 'status', 'sale'])
      if (r.schema_version !== 1) fail()
      if (r.status === 'RETIRED' && r.sale === null) return null
      if (r.status === 'COMMITTED') return parseBackendCounterReceipt(r.sale, checked)
      fail()
    },
    async recover(token: string, saved: BackendCounterAttempt, signal?: AbortSignal) {
      const checked = attempt(saved)
      return parseBackendCounterReceipt(await call(token, '/recover', '{}', checked.key, signal, checked), checked)
    },
  }
}
