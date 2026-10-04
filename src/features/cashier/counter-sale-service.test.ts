import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createBackendCounterAttempt } from './backend-counter-sale-service'
import { bindBackendSession } from '../auth/backend-runtime'
import { readCounterPending, submitCounterSale, finishCounterSale, retireCounterSale } from './counter-sale-service'
const request = vi.fn(), storage = new Map<string, string>()
const attempt = () => createBackendCounterAttempt(4, 1, { items: [{ product_id: 2, quantity: 1 }], expected_total_cents: 100, customer_id: 8 })
const receipt = { schema_version: 1, id: 3, folio: 'VD-' + 'A'.repeat(24), branch_id: 1, created_by: 4, status: 'SENT_TO_CASHIER', subtotal_cents: 100, discount_cents: 0, total_cents: 100, created_at: '2026-10-01T12:00:00Z', idempotent_replay: true }
beforeEach(() => {
  storage.clear(); request.mockReset(); vi.stubGlobal('fetch', request)
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('navigator', { locks: { request: (_key: string, run: () => unknown) => run() } })
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 4, expiresAt: Date.now() + 60000 }, accessStatus: 'ready', context: { user: { id: 4 }, branch: { id: 1, is_active: true } } } as never))
})
afterEach(() => vi.unstubAllGlobals())
it('persists original customer/items before POST and recovers after response loss', async () => {
  const saved = attempt()
  request.mockImplementationOnce(async () => { expect(readCounterPending('4', '1')).toEqual(saved); throw new TypeError('offline') })
  await expect(submitCounterSale(saved)).rejects.toThrow()
  request.mockResolvedValueOnce(Response.json(receipt))
  expect((await submitCounterSale(readCounterPending('4', '1')!)).id).toBe(3)
  expect(request.mock.calls[1][0]).toBe('/api/v1/sales/recover')
  expect(request.mock.calls[1][1].headers['Idempotency-Key']).toBe(saved.key)
})
it('resends only after authoritative not-found, preserving the original body and key', async () => {
  const saved = attempt(); request.mockRejectedValueOnce(new TypeError('offline'))
  await expect(submitCounterSale(saved)).rejects.toThrow()
  request.mockResolvedValueOnce(Response.json({ error: 'SALE_NOT_FOUND' }, { status: 404 })).mockResolvedValueOnce(Response.json(receipt))
  await submitCounterSale(saved)
  expect(request.mock.calls[2][1].body).toBe(saved.body)
  expect(request.mock.calls[2][1].headers['Idempotency-Key']).toBe(saved.key)
})
it('does not discard rejected attempts until the server fences the key', async () => {
  const saved = attempt(); request.mockResolvedValueOnce(Response.json({ error: 'SALE_PRICE_CHANGED' }, { status: 409 }))
  await expect(submitCounterSale(saved)).rejects.toThrow()
  expect(readCounterPending('4','1')).toEqual(saved)
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'RETIRED', sale: null }))
  expect(await retireCounterSale(saved)).toBeNull()
  expect(readCounterPending('4','1')).toBeNull()
})
it('returns a committed sale instead of discarding it when retirement loses the race', async () => {
  const saved = attempt(); request.mockRejectedValueOnce(new TypeError('offline'))
  await expect(submitCounterSale(saved)).rejects.toThrow()
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'COMMITTED', sale: receipt }))
  expect((await retireCounterSale(saved))?.id).toBe(3)
})
it('blocks another attempt and cannot clear its saved record', async () => {
  const saved = attempt(); request.mockRejectedValueOnce(new TypeError('offline'))
  await expect(submitCounterSale(saved)).rejects.toThrow()
  await expect(submitCounterSale(attempt())).rejects.toThrow()
  finishCounterSale(attempt())
  expect(request).toHaveBeenCalledTimes(1)
  expect(readCounterPending('4','1')).toEqual(saved)
})
it('blocks transmission when persistent storage fails', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  await expect(submitCounterSale(attempt())).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})
