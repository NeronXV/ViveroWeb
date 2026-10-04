import { expect, it, vi } from 'vitest'
import { BackendOrderError, clearBackendOrderAttempt, readBackendOrderAttempt, saveBackendOrderAttempt, createBackendOrderAttempt, createBackendOrderService, parseBackendOrderQuote, parseBackendOrderReceipt } from './backend-order-service'

const input = { branch_id: 1, items: [{ product_id: 2, quantity: 3 }] }
const submission = { ...input, customer_name: 'Demo cliente', customer_email: 'demo@example.invalid', customer_phone: null, notes: null, expected_total_cents: 240 }
const quote = { schema_version: 1, branch_id: 1, subtotal_cents: 300, discount_cents: 60, total_cents: 240,
  items: [{ product_id: 2, product_name: 'Demo', internal_code: 'DEMO', quantity: 3, list_price_cents: 100, unit_price_cents: 80,
    promotion_id: 3, promotion_name: 'Demo', line_total_cents: 240 }] }
const receipt = { schema_version: 1, id: 4, order_number: 'VW-4', status: 'PENDING', total_cents: 240,
  created_at: '2026-10-01T12:00:00.000000Z', idempotent_replay: false }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

it('retains exactly the same attempt across reload and refuses corrupt or foreign authority records', () => {
  let saved: string | null = null
  const storage = { setItem: vi.fn((_key: string, value: string) => { saved = value }), getItem: vi.fn(() => saved), removeItem: vi.fn(() => { saved = null }) }
  expect(readBackendOrderAttempt(storage)).toBeNull()
  const attempt = createBackendOrderAttempt(submission)
  saveBackendOrderAttempt(storage, attempt)
  expect(readBackendOrderAttempt(storage)).toEqual(attempt)
  expect(storage.setItem.mock.calls[0][0]).not.toBe('viveroweb_public_cart_v1')
  saved = JSON.stringify({ schema_version: 1, authority: 'supabase', attempt })
  expect(() => readBackendOrderAttempt(storage)).toThrow(BackendOrderError)
  saved = 'corrupt'
  expect(() => readBackendOrderAttempt(storage)).toThrow(BackendOrderError)
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(() => saveBackendOrderAttempt({ setItem: () => { throw new Error('quota') } }, attempt)).toThrow('quota')
  clearBackendOrderAttempt(storage)
  expect(readBackendOrderAttempt(storage)).toBeNull()
})

it('validates server quote snapshots and totals without substituting client prices', () => {
  expect(parseBackendOrderQuote(quote, input)).toEqual(quote)
  for (const change of [{ total_cents: 241 }, { branch_id: 2 }, { discount_cents: 1 }, { schema_version: 2 }, { items: [quote.items[0], quote.items[0]] },
    { items: [{ ...quote.items[0], quantity: 2 }] }, { items: [{ ...quote.items[0], line_total_cents: 239 }] }]) expect(() => parseBackendOrderQuote({ ...quote, ...change }, input)).toThrow(BackendOrderError)
})
it('creates independent cryptographic keys and immutable content detached from the cart', () => {
  const attempt = createBackendOrderAttempt(submission)
  expect(attempt.key).toMatch(/^[a-f0-9]{64}$/)
  expect(createBackendOrderAttempt(submission).key).not.toBe(attempt.key)
  const mutable = structuredClone(submission)
  const saved = createBackendOrderAttempt(mutable)
  mutable.items[0].quantity = 9
  expect(JSON.parse(saved.body).items[0].quantity).toBe(3)
  expect(Object.isFrozen(attempt)).toBe(true)
})
it('rejects legacy IDs, duplicate lines, fractional quantities and client prices before sending', async () => {
  const request = vi.fn<typeof fetch>(), service = createBackendOrderService(request)
  for (const value of [{ ...input, branch_id: 'uuid' }, { ...input, items: [] }, { ...input, items: [input.items[0], input.items[0]] },
    { ...input, items: [{ product_id: 2, quantity: 0.5 }] }, { ...input, items: [{ ...input.items[0], unit_price_cents: 1 }] }]) {
    await expect(service.quote(value as unknown as typeof input)).rejects.toThrow(BackendOrderError)
  }
  await expect(service.recover('invalid')).rejects.toThrow(BackendOrderError)
  expect(request).not.toHaveBeenCalled()
})
it('sends quote, submission and recovery through the same origin without secrets in URLs', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(quote)).mockResolvedValueOnce(response(receipt, 201))
    .mockResolvedValueOnce(response({ ...receipt, idempotent_replay: true }))
  const service = createBackendOrderService(request), attempt = createBackendOrderAttempt(submission)
  await service.quote(input)
  expect(await service.submit(attempt)).toEqual(receipt)
  expect((await service.recover(attempt.key)).idempotent_replay).toBe(true)
  expect(request.mock.calls.map(c => c[0])).toEqual(['/api/v1/web-orders/quote', '/api/v1/web-orders', '/api/v1/web-orders/recover'])
  expect(request.mock.calls[1][1]).toMatchObject({ body: attempt.body, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { 'Idempotency-Key': attempt.key } })
  expect(request.mock.calls[2][1]).toMatchObject({ body: '{}', headers: { 'Idempotency-Key': attempt.key } })
})
it('treats transport loss and malformed successful submit as uncertain with no automatic retry', async () => {
  const attempt = createBackendOrderAttempt(submission)
  for (const result of [() => Promise.reject(new TypeError('network')), () => Promise.resolve(response({ unexpected: true }, 201)), () => Promise.resolve(response({ ...receipt, total_cents: 241 }, 201)), () => Promise.resolve(response({ error: 'WEB_ORDER_RESULT_UNCERTAIN' }, 503))]) {
    const request = vi.fn<typeof fetch>().mockImplementationOnce(result)
    await expect(createBackendOrderService(request).submit(attempt)).rejects.toMatchObject({ resultUncertain: true })
    expect(request).toHaveBeenCalledTimes(1)
  }
})
it('reports authoritative price conflicts and not-found recovery without inventing a receipt', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ error: 'WEB_ORDER_PRICE_CHANGED' }, 409))
    .mockResolvedValueOnce(response({ error: 'WEB_ORDER_NOT_FOUND' }, 404))
  const service = createBackendOrderService(request), attempt = createBackendOrderAttempt(submission)
  await expect(service.submit(attempt)).rejects.toMatchObject({ code: 'WEB_ORDER_PRICE_CHANGED', resultUncertain: false })
  await expect(service.recover(attempt.key)).rejects.toMatchObject({ code: 'WEB_ORDER_NOT_FOUND' })
})
it('rejects invalid receipt identities, status and amounts', () => {
  expect(parseBackendOrderReceipt(receipt)).toEqual(receipt)
  for (const change of [{ id: 'uuid' }, { order_number: 'VW-5' }, { status: 'PAID' }, { total_cents: 0 }, { created_at: 'yesterday' }, { created_at: '2026-02-30T12:00:00.000000Z' }, { extra: true }]) expect(() => parseBackendOrderReceipt({ ...receipt, ...change })).toThrow(BackendOrderError)
})
it('validates options and propagates abort as an uncertain submission', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, branches: [{ id: 1, code: 'DEMO', name: 'Demo' }] }))
    .mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
  const service = createBackendOrderService(request)
  expect((await service.options()).branches[0].id).toBe(1)
  const controller = new AbortController(); controller.abort()
  await expect(service.submit(createBackendOrderAttempt(submission), controller.signal)).rejects.toMatchObject({ resultUncertain: true })
  expect((request.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true)
})
