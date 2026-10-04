import { expect, it, vi } from 'vitest'
import { createBackendOrderCoordinator } from './backend-order-coordinator'
import { createBackendOrderAttempt, createBackendOrderService, readBackendOrderAttempt, saveBackendOrderAttempt } from './backend-order-service'

const input = { branch_id: 1, items: [{ product_id: 2, quantity: 3 }], customer_name: 'Demo cliente', customer_email: 'demo@example.invalid', customer_phone: null, notes: null, expected_total_cents: 240 }
const receipt = { schema_version: 1, id: 4, order_number: 'VW-4', status: 'PENDING', total_cents: 240, created_at: '2026-10-01T12:00:00.000000Z', idempotent_replay: false }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear(), key: () => null, get length() { return values.size } }
}
const lock = <T>(work: () => Promise<T>) => work()
it('persists the original before POST and retains it on a lost response', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  const request = vi.fn<typeof fetch>(async () => { expect(readBackendOrderAttempt(saved)).toEqual(attempt); throw new Error('offline') })
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).send(attempt)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).send(createBackendOrderAttempt(input))).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})
it('never posts if persistence or exclusive ownership fails', async () => {
  const request = vi.fn<typeof fetch>(), saved = storage()
  saved.setItem = () => { throw new Error('quota') }
  const service = createBackendOrderService(request), attempt = createBackendOrderAttempt(input)
  await expect(createBackendOrderCoordinator(saved, service, lock).send(attempt)).rejects.toThrow('quota')
  await expect(createBackendOrderCoordinator(storage(), service, () => Promise.reject(new Error('lock'))).send(attempt)).rejects.toThrow('lock')
  expect(request).not.toHaveBeenCalled()
})
it('recovers without sending again and verifies the original total before clearing', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved, attempt)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ...receipt, total_cents: 241 })))
    .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
  const coordinator = createBackendOrderCoordinator(saved, createBackendOrderService(request), lock)
  await expect(coordinator.recover(attempt)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  await expect(coordinator.recover(attempt)).resolves.toEqual(receipt)
  expect(readBackendOrderAttempt(saved)).toBeNull()
  expect(request.mock.calls.every(([url]) => String(url).endsWith('/recover'))).toBe(true)
})
it('reposts only after an explicit not-found result using the original key and body', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved, attempt)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'WEB_ORDER_NOT_FOUND' }), { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).recover(attempt)).resolves.toEqual(receipt)
  expect(request.mock.calls[1][1]?.body).toBe(attempt.body)
  expect(request.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': attempt.key })
})
