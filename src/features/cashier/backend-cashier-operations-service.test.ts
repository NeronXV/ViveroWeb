import { describe, expect, it, vi } from 'vitest'
import { createBackendCashierOperationAttempt, createBackendCashierOperationsService, parseBackendClosing, parseBackendRefund, readBackendCashierOperationAttempt, finishBackendCashierOperationAttempt } from './backend-cashier-operations-service'
const identity = { userId: 2, branchId: 3 }
const closingInput = { opening_cash_cents: 0, counted_cash_cents: 0 }
const refundInput = { reason: 'Producto devuelto', method: 'CASH' as const, restock: false, money_returned: true as const }
const context = { schema_version: 1, user: { id: 2, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE', role: { id: 1, name: 'OWNER', display_name: 'Dueño' }, branch: { id: 3, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: ['OPERATE_CASHIER', 'MANAGE_DISCOUNTS'] }
const row = { id: 4, branch_id: 3, cashier_id: 2, opening_cash_cents: 0, counted_cash_cents: 0, cash_sales_cents: 100, card_sales_cents: 0, transfer_sales_cents: 0, cash_refunds_cents: 200, other_refunds_cents: 0, expected_cash_cents: -100, difference_cents: 100, created_at: '2026-10-01T12:00:00.000000Z' }
const receipt = { schema_version: 1, closing: row, payment_ids: [1, 2], refund_ids: [3], idempotent_replay: false }
const token = 'a'.repeat(43)
const exclusive = async <T,>(_name: string, action: () => Promise<T>): Promise<T> => action()
function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
describe('backend cashier operations', () => {
  it('freezes the request and preserves its key for replay', () => {
    const input = { ...closingInput }, attempt = createBackendCashierOperationAttempt(identity, 'closing', input)
    input.counted_cash_cents = 99
    expect(JSON.parse(attempt.body)).toEqual(closingInput)
    expect(attempt.key).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(attempt)).toBe(true)
  })
  it('requires explicit returned money and valid cents', () => {
    expect(() => createBackendCashierOperationAttempt(identity, 'refund', { ...refundInput, money_returned: false as unknown as true }, 1)).toThrow()
    expect(() => createBackendCashierOperationAttempt(identity, 'closing', { ...closingInput, counted_cash_cents: 0.5 })).toThrow()
  })
  it('accepts negative expected cash while verifying exact totals', () => {
    expect(parseBackendClosing(receipt, identity).closing.expected_cash_cents).toBe(-100)
    expect(() => parseBackendClosing({ ...receipt, closing: { ...row, difference_cents: 99 } }, identity)).toThrow()
  })
  it('rejects duplicate membership and another cashier', () => {
    expect(() => parseBackendClosing({ ...receipt, payment_ids: [1, 1] }, identity)).toThrow()
    expect(() => parseBackendClosing(receipt, { ...identity, userId: 5 })).toThrow()
  })
  it('checks refund identity, request and confidential fields', () => {
    const attempt = createBackendCashierOperationAttempt(identity, 'refund', refundInput, 7)
    const refund = { id: 9, sale_id: 7, payment_id: 8, branch_id: 3, refunded_by: 2, amount_cents: 100, method: 'CASH', reason: refundInput.reason, restock: false, created_at: '2026-10-01T12:00:00.000Z' }
    expect(parseBackendRefund({ schema_version: 1, refund, idempotent_replay: true }, attempt).refund.id).toBe(9)
    expect(() => parseBackendRefund({ schema_version: 1, refund: { ...refund, idempotency_key: 'secret' }, idempotent_replay: true }, attempt)).toThrow()
  })
  it('verifies the session before writing and keeps request identity on replay', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
    const attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    await createBackendCashierOperationsService(request, exclusive).submit(token, attempt, memory())
    expect(request.mock.calls[0][0]).toBe('/api/v1/auth/me')
    expect(request.mock.calls[1][1]).toMatchObject({ body: attempt.body, credentials: 'omit', headers: { 'Idempotency-Key': attempt.key } })
  })
  it('prevents a write after a branch change', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...context, branch: { ...context.branch, id: 6 } }))
    await expect(createBackendCashierOperationsService(request, exclusive).submit(token, createBackendCashierOperationAttempt(identity, 'closing', closingInput), memory())).rejects.toMatchObject({ code: 'BRANCH_CHANGED' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('marks a lost mutation response as uncertain without retrying', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('network'))
    await expect(createBackendCashierOperationsService(request, exclusive).submit(token, createBackendCashierOperationAttempt(identity, 'closing', closingInput), memory())).rejects.toMatchObject({ resultUncertain: true })
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('recovers a closing with the original key and empty body', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ ...receipt, idempotent_replay: true }))
    const attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    await createBackendCashierOperationsService(request, exclusive).recoverClosing(token, attempt)
    expect(request.mock.calls[1][0]).toBe('/api/v1/cashier/closings/recover')
    expect(request.mock.calls[1][1]).toMatchObject({ body: '{}', headers: { 'Idempotency-Key': attempt.key } })
  })
})

describe('durable cashier operation attempts', () => {
  it('restores the same immutable attempt after reload and scopes it to identity', async () => {
    const storage = memory(), attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
    await expect(createBackendCashierOperationsService(request, exclusive).submit(token, attempt, storage)).rejects.toMatchObject({ resultUncertain: true })
    const restored = readBackendCashierOperationAttempt(storage, identity)
    expect(restored).toEqual(attempt)
    expect(Object.isFrozen(restored)).toBe(true)
    expect(readBackendCashierOperationAttempt(storage, { ...identity, userId: 7 })).toBeNull()
  })
  it('blocks another kind of operation without overwriting a pending attempt', async () => {
    const storage = memory(), attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
    const service = createBackendCashierOperationsService(request, exclusive)
    await service.submit(token, attempt, storage)
    await expect(service.submit(token, createBackendCashierOperationAttempt(identity, 'refund', refundInput, 7), storage)).rejects.toMatchObject({ code: 'PENDING_ATTEMPT' })
    expect(readBackendCashierOperationAttempt(storage, identity)).toEqual(attempt)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('never sends when persistence fails or silently discards the write', async () => {
    const request = vi.fn<typeof fetch>(), service = createBackendCashierOperationsService(request, exclusive)
    const attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    await expect(service.submit(token, attempt, { ...memory(), setItem: () => { throw new Error('quota') } })).rejects.toThrow('quota')
    await expect(service.submit(token, attempt, { ...memory(), setItem: () => {} })).rejects.toMatchObject({ code: 'STORAGE_FAILED' })
    expect(request).not.toHaveBeenCalled()
  })
  it('keeps corrupt pending data instead of replacing it', async () => {
    const request = vi.fn<typeof fetch>(), storage = { ...memory(), getItem: () => '{invalid' }, set = vi.spyOn(storage, 'setItem')
    await expect(createBackendCashierOperationsService(request, exclusive).submit(token, createBackendCashierOperationAttempt(identity, 'closing', closingInput), storage)).rejects.toThrow()
    expect(set).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
  it('clears only the matching acknowledged attempt under the same lock', async () => {
    const storage = memory(), attempt = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
    await createBackendCashierOperationsService(request, exclusive).submit(token, attempt, storage)
    await finishBackendCashierOperationAttempt(storage, createBackendCashierOperationAttempt(identity, 'closing', closingInput), exclusive)
    expect(readBackendCashierOperationAttempt(storage, identity)).toEqual(attempt)
    await finishBackendCashierOperationAttempt(storage, attempt, exclusive)
    expect(readBackendCashierOperationAttempt(storage, identity)).toBeNull()
  })
  it('fails closed without browser locks', async () => {
    vi.stubGlobal('navigator', {})
    const request = vi.fn<typeof fetch>()
    await expect(createBackendCashierOperationsService(request).submit(token, createBackendCashierOperationAttempt(identity, 'closing', closingInput), memory())).rejects.toMatchObject({ code: 'BROWSER_LOCK_REQUIRED' })
    expect(request).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

it('serializes simultaneous submissions sharing one identity', async () => {
  let tail = Promise.resolve()
  const locks = new Set<string>()
  const serialized = <T,>(name: string, action: () => Promise<T>): Promise<T> => {
    locks.add(name)
    const next = tail.then(action)
    tail = next.then(() => undefined, () => undefined)
    return next
  }
  const storage = memory(), request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
  const service = createBackendCashierOperationsService(request, serialized)
  const first = createBackendCashierOperationAttempt(identity, 'closing', closingInput)
  const second = createBackendCashierOperationAttempt(identity, 'refund', refundInput, 7)
  const results = await Promise.allSettled([service.submit(token, first, storage), service.submit(token, second, storage)])
  expect(results[0].status).toBe('fulfilled')
  expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'PENDING_ATTEMPT' } })
  expect(locks.size).toBe(1)
  expect(request).toHaveBeenCalledTimes(2)
  expect(readBackendCashierOperationAttempt(storage, identity)).toEqual(first)
})

it('looks up an exact refund folio with verified identity and no mutation', async () => {
  const preview = { schema_version: 1, sale_id: 7, folio: 'VD-DEMO', amount_cents: 100, already_refunded: false, restock_available: true }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(preview))
  expect((await createBackendCashierOperationsService(request, exclusive).refundLookup(token, identity, ' VD-DEMO ')).sale_id).toBe(7)
  expect(request.mock.calls[1][0]).toBe('/api/v1/cashier/refunds/lookup?folio=VD-DEMO')
  expect(request.mock.calls[1][1]?.method).toBe('GET')
  const bad = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ ...preview, folio: 'OTHER' }))
  await expect(createBackendCashierOperationsService(bad, exclusive).refundLookup(token, identity, 'VD-DEMO')).rejects.toThrow()
})
