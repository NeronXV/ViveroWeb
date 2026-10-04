import { createBackendAuthService } from '../auth/backend-auth-service'

export interface CashierIdentity { userId: number; branchId: number }
export interface RefundInput { reason: string; method: 'CASH' | 'CARD' | 'TRANSFER'; restock: boolean; money_returned: true }
export interface ClosingInput { opening_cash_cents: number; counted_cash_cents: number }
export interface CashierOperationAttempt extends CashierIdentity { readonly key: string; readonly kind: 'refund' | 'closing'; readonly saleId: number | null; readonly body: string }
export class BackendCashierOperationError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly resultUncertain = false) {
    super(resultUncertain ? 'No se confirmó la operación. Conserva el intento para recuperar su resultado.' : 'No fue posible completar la operación de Caja.')
  }
}
function fail(): never { throw new BackendCashierOperationError(502, 'INCOMPATIBLE_RESPONSE') }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  return value as Record<string, unknown>
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) fail()
  return value
}
const id = (value: unknown) => { const n = integer(value, 1); if (n > 4294967295) fail(); return n }
function refundInput(value: unknown): RefundInput {
  const r = object(value)
  if (Object.keys(r).length !== 4 || r.money_returned !== true || typeof r.restock !== 'boolean'
    || !['CASH', 'CARD', 'TRANSFER'].includes(String(r.method)) || typeof r.reason !== 'string'
    || [...r.reason].some(c => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159)) || r.reason.trim().length < 5 || r.reason.trim().length > 300) fail()
  return { reason: r.reason.trim(), method: r.method as RefundInput['method'], restock: r.restock, money_returned: true }
}
function closingInput(value: unknown): ClosingInput {
  const r = object(value)
  if (Object.keys(r).length !== 2) fail()
  return { opening_cash_cents: integer(r.opening_cash_cents), counted_cash_cents: integer(r.counted_cash_cents) }
}
function checkedAttempt(value: CashierOperationAttempt): CashierOperationAttempt {
  id(value.userId); id(value.branchId)
  if (!/^[a-f0-9]{64}$/.test(value.key) || typeof value.body !== 'string') fail()
  let body: unknown
  try { body = JSON.parse(value.body) } catch { fail() }
  if (value.kind === 'refund') { id(value.saleId); refundInput(body) }
  else if (value.kind === 'closing' && value.saleId === null) closingInput(body)
  else fail()
  return Object.freeze({ userId: value.userId, branchId: value.branchId, key: value.key, kind: value.kind, saleId: value.saleId, body: value.body })
}
export function createBackendCashierOperationAttempt(identity: CashierIdentity, kind: 'refund', input: RefundInput, saleId: number): CashierOperationAttempt
export function createBackendCashierOperationAttempt(identity: CashierIdentity, kind: 'closing', input: ClosingInput): CashierOperationAttempt
export function createBackendCashierOperationAttempt(identity: CashierIdentity, kind: 'refund' | 'closing', input: RefundInput | ClosingInput, saleId?: number): CashierOperationAttempt {
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  return Object.freeze(checkedAttempt({ userId: id(identity.userId), branchId: id(identity.branchId), key, kind,
    saleId: kind === 'refund' ? id(saleId) : null, body: JSON.stringify(kind === 'refund' ? refundInput(input) : closingInput(input)) }))
}
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail()
}
function ids(value: unknown) {
  if (!Array.isArray(value)) fail()
  const result = value.map(id)
  if (result.some((v, i) => i > 0 && v <= result[i - 1])) fail()
  return result
}
function closing(value: unknown, identity: CashierIdentity) {
  const r = object(value)
  id(r.id); date(r.created_at)
  if (id(r.branch_id) !== identity.branchId || id(r.cashier_id) !== identity.userId) fail()
  for (const name of ['opening_cash_cents', 'counted_cash_cents', 'cash_sales_cents', 'card_sales_cents', 'transfer_sales_cents', 'cash_refunds_cents', 'other_refunds_cents']) integer(r[name])
  integer(r.expected_cash_cents, -Number.MAX_SAFE_INTEGER); integer(r.difference_cents, -Number.MAX_SAFE_INTEGER)
  if (BigInt(r.expected_cash_cents as number) !== BigInt(r.opening_cash_cents as number) + BigInt(r.cash_sales_cents as number) - BigInt(r.cash_refunds_cents as number)
    || BigInt(r.difference_cents as number) !== BigInt(r.counted_cash_cents as number) - BigInt(r.expected_cash_cents as number)) fail()
  return r
}
export function parseBackendClosing(value: unknown, identity: CashierIdentity, attempt?: CashierOperationAttempt) {
  const r = object(value)
  if (r.schema_version !== 1) fail()
  const row = closing(r.closing, identity), paymentIds = ids(r.payment_ids), refundIds = ids(r.refund_ids)
  if (attempt) {
    checkedAttempt(attempt)
    if (attempt.kind !== 'closing' || typeof r.idempotent_replay !== 'boolean') fail()
    const input = closingInput(JSON.parse(attempt.body))
    if (row.opening_cash_cents !== input.opening_cash_cents || row.counted_cash_cents !== input.counted_cash_cents) fail()
  }
  return { ...r, closing: row, payment_ids: paymentIds, refund_ids: refundIds }
}
export function parseBackendRefund(value: unknown, attempt: CashierOperationAttempt) {
  checkedAttempt(attempt)
  const r = object(value), row = object(r.refund), input = refundInput(JSON.parse(attempt.body))
  if (attempt.kind !== 'refund' || r.schema_version !== 1 || typeof r.idempotent_replay !== 'boolean'
    || id(row.sale_id) !== attempt.saleId || id(row.branch_id) !== attempt.branchId || id(row.refunded_by) !== attempt.userId
    || row.method !== input.method || row.reason !== input.reason || row.restock !== input.restock) fail()
  id(row.id); id(row.payment_id); integer(row.amount_cents, 1); date(row.created_at)
  if ('idempotency_key' in row || 'request_hash' in row) fail()
  return { ...r, refund: row }
}
type OperationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Exclusive = <T>(name: string, action: () => Promise<T>) => Promise<T>
const browserExclusive: Exclusive = async (name, action) => {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new BackendCashierOperationError(0, 'BROWSER_LOCK_REQUIRED')
  return navigator.locks.request(name, action)
}
const pendingKey = (identity: CashierIdentity) => `viveroweb_backend_cashier_operation_v1:${id(identity.userId)}:${id(identity.branchId)}`
export function readBackendCashierOperationAttempt(storage: Pick<Storage, 'getItem'>, identity: CashierIdentity): CashierOperationAttempt | null {
  const raw = storage.getItem(pendingKey(identity))
  if (raw === null) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { fail() }
  const envelope = object(parsed)
  if (Object.keys(envelope).length !== 3 || envelope.schema_version !== 1 || envelope.authority !== 'backend-api') fail()
  const value = object(envelope.attempt)
  if (Object.keys(value).length !== 6 || typeof value.body !== 'string' || typeof value.key !== 'string') fail()
  const attempt = checkedAttempt(value as unknown as CashierOperationAttempt)
  if (attempt.userId !== identity.userId || attempt.branchId !== identity.branchId) fail()
  return attempt
}
const sameAttempt = (a: CashierOperationAttempt, b: CashierOperationAttempt) =>
  a.key === b.key && a.body === b.body && a.kind === b.kind && a.saleId === b.saleId && a.userId === b.userId && a.branchId === b.branchId
// Call only after the operator has received the validated receipt. Clearing is
// serialized with submission and never removes another operation's pending data.
export async function finishBackendCashierOperationAttempt(storage: OperationStorage, value: CashierOperationAttempt, exclusive: Exclusive = browserExclusive): Promise<void> {
  const attempt = checkedAttempt(value)
  await exclusive(pendingKey(attempt), async () => {
    const pending = readBackendCashierOperationAttempt(storage, attempt)
    if (pending && sameAttempt(pending, attempt)) storage.removeItem(pendingKey(attempt))
  })
}
// The caller must retain the immutable attempt
// after an uncertain result. No automatic retry or provider switch.
export function createBackendCashierOperationsService(request: typeof fetch = fetch, exclusive: Exclusive = browserExclusive) {
  async function call(token: string, identity: CashierIdentity, path: string, method = 'GET', body?: string, key?: string, signal?: AbortSignal) {
    id(identity.userId); id(identity.branchId)
    const timeout = AbortSignal.timeout(15000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    const context = await createBackendAuthService(request).context(token, identity.userId, combined)
    if (context.branch?.id !== identity.branchId || !context.branch.is_active) throw new BackendCashierOperationError(403, 'BRANCH_CHANGED')
    let response: Response, value: unknown
    try {
      response = await request(`/api/v1/cashier${path}`, { method, body, signal: combined, credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) } })
      value = await response.json()
    } catch { throw new BackendCashierOperationError(0, 'CONNECTION_FAILED', method === 'POST' && path !== '/closings/recover') }
    if (!response.ok) throw new BackendCashierOperationError(response.status, typeof object(value).error === 'string' ? String(object(value).error) : 'REQUEST_FAILED', method === 'POST' && response.status >= 500)
    return value
  }
  return {
    async refundLookup(token: string, identity: CashierIdentity, folio: string, signal?: AbortSignal) {
      if (typeof folio !== 'string' || !folio.trim() || [...folio.trim()].length > 40 || [...folio].some(c => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159))) fail()
      const r = object(await call(token, identity, `/refunds/lookup?${new URLSearchParams({ folio: folio.trim() })}`, 'GET', undefined, undefined, signal))
      if (r.schema_version !== 1 || r.folio !== folio.trim() || typeof r.already_refunded !== 'boolean' || typeof r.restock_available !== 'boolean') fail()
      id(r.sale_id); integer(r.amount_cents, 1)
      return r
    },
    async refundPreview(token: string, identity: CashierIdentity, saleId: number, signal?: AbortSignal) {
      const r = object(await call(token, identity, `/sales/${id(saleId)}/refunds`, 'GET', undefined, undefined, signal))
      if (r.schema_version !== 1 || id(r.sale_id) !== saleId || typeof r.folio !== 'string' || !r.folio || typeof r.already_refunded !== 'boolean' || typeof r.restock_available !== 'boolean') fail()
      integer(r.amount_cents, 1)
      return r
    },
    async closingPreview(token: string, identity: CashierIdentity, signal?: AbortSignal) {
      const r = object(await call(token, identity, '/closings/preview', 'GET', undefined, undefined, signal))
      if (r.schema_version !== 1 || id(r.branch_id) !== identity.branchId || id(r.cashier_id) !== identity.userId) fail()
      for (const field of ['cash_sales_cents', 'card_sales_cents', 'transfer_sales_cents', 'cash_refunds_cents', 'other_refunds_cents', 'payment_count', 'refund_count']) integer(r[field])
      if (r.last_closing !== null) closing(r.last_closing, identity)
      return r
    },
    async closingDetail(token: string, identity: CashierIdentity, closingId: number, signal?: AbortSignal) {
      const r = parseBackendClosing(await call(token, identity, `/closings/${id(closingId)}`, 'GET', undefined, undefined, signal), identity)
      if (r.closing.id !== closingId) fail()
      return r
    },
    async submit(token: string, value: CashierOperationAttempt, storage: OperationStorage, signal?: AbortSignal) {
      const attempt = checkedAttempt(value)
      return exclusive(pendingKey(attempt), async () => {
        const pending = readBackendCashierOperationAttempt(storage, attempt)
        if (pending && !sameAttempt(pending, attempt)) throw new BackendCashierOperationError(409, 'PENDING_ATTEMPT')
        storage.setItem(pendingKey(attempt), JSON.stringify({ schema_version: 1, authority: 'backend-api', attempt }))
        const saved = readBackendCashierOperationAttempt(storage, attempt)
        if (!saved || !sameAttempt(saved, attempt)) throw new BackendCashierOperationError(0, 'STORAGE_FAILED')
        const path = attempt.kind === 'closing' ? '/closings' : `/sales/${attempt.saleId}/refunds`
        const value = await call(token, attempt, path, 'POST', attempt.body, attempt.key, signal)
        try { return attempt.kind === 'closing' ? parseBackendClosing(value, attempt, attempt) : parseBackendRefund(value, attempt) }
        catch { throw new BackendCashierOperationError(502, 'INCOMPATIBLE_RESPONSE', true) }
      })
    },
    async recoverClosing(token: string, attempt: CashierOperationAttempt, signal?: AbortSignal) {
      checkedAttempt(attempt)
      if (attempt.kind !== 'closing') fail()
      return parseBackendClosing(await call(token, attempt, '/closings/recover', 'POST', '{}', attempt.key, signal), attempt, attempt)
    },
  }
}
