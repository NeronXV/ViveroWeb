import { expect, it, vi } from 'vitest'
import { BackendCounterError, createBackendCounterAttempt, createBackendCounterSaleService, finishBackendCounterAttempt, parseBackendCounterReceipt, readBackendCounterAttempt } from './backend-counter-sale-service'
const token = 'A'.repeat(43), input = { items: [{ product_id: 2, quantity: 101 }], expected_total_cents: 10100 }
const receipt = { schema_version: 1, id: 3, folio: 'VD-' + 'A'.repeat(24), branch_id: 1, created_by: 4, status: 'SENT_TO_CASHIER', subtotal_cents: 10100, discount_cents: 0, total_cents: 10100, created_at: '2026-10-01T12:00:00Z', idempotent_replay: false }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const immediate = async <T,>(_name: string, action: () => Promise<T>) => action()

it('scans an exact code with leading zeroes and preserves server price and integer ID', async () => {
  const product = { id: 2, internal_code: 'DEMO', barcode: '001-Abc', common_name: 'Demo', scientific_name: null, description: '', category_id: 1,
    price_cents: 100, effective_price_cents: 90, unit: 'pieza', is_active: true, watering_advice: '', light_type: '', recommended_climate: '', image: null,
    active_promotion: { id: 3, name: 'Demo', discount_percent: 10 } }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, item: product })).mockResolvedValueOnce(response({ schema_version: 1, item: null }))
  const service = createBackendCounterSaleService(request, immediate)
  expect((await service.scan(token, ' 001-Abc '))?.effective_price_cents).toBe(90)
  expect(request.mock.calls[0][0]).toBe('/api/v1/products/scan')
  expect(request.mock.calls[0][1]).toMatchObject({ body: '{"code":"001-Abc"}', headers: { Authorization: `Bearer ${token}` } })
  expect(await service.scan(token, 'missing')).toBeNull()
})
it('distinguishes ambiguous scan from missing products and rejects invalid request/response', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ error: 'PRODUCT_SCAN_CODE_AMBIGUOUS' }, 409)).mockResolvedValueOnce(response({ schema_version: 2, item: null }))
  const service = createBackendCounterSaleService(request, immediate)
  await expect(service.scan(token, 'duplicate')).rejects.toMatchObject({ code: 'PRODUCT_SCAN_CODE_AMBIGUOUS', resultUncertain: false })
  await expect(service.scan(token, 'valid')).rejects.toThrow()
  for (const code of ['x', 'x'.repeat(129), 'ab\n']) await expect(service.scan(token, code)).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
})
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
it('captures integer quantities up to the sale contract limit and independent cryptographic attempts', () => {
  const mutable = structuredClone(input), saved = createBackendCounterAttempt(4, 1, mutable)
  mutable.items[0].quantity = 1
  expect(JSON.parse(saved.body).items[0].quantity).toBe(101)
  expect(saved.key).toMatch(/^[a-f0-9]{64}$/)
  expect(Object.isFrozen(saved)).toBe(true)
  for (const items of [[], [{ product_id: 'uuid', quantity: 1 }], [{ product_id: 2, quantity: 100001 }], [{ product_id: 2, quantity: 0.5 }], [input.items[0], input.items[0]]]) expect(() => createBackendCounterAttempt(4, 1, { ...input, items } as typeof input)).toThrow(BackendCounterError)
})
it('validates receipt identity, branch, expected total, dates and effective-price subtotal', () => {
  const saved = createBackendCounterAttempt(4, 1, input)
  expect(parseBackendCounterReceipt(receipt, saved)).toEqual(receipt)
  for (const changed of [{ created_by: 5 }, { branch_id: 2 }, { discount_cents: 1 }, { total_cents: 10099 }, { created_at: '2026-02-30T12:00:00Z' }, { request_hash: 'secret' }]) expect(() => parseBackendCounterReceipt({ ...receipt, ...changed }, saved)).toThrow(BackendCounterError)
})
it('quotes using session branch and handles quantities greater than public-order limit', async () => {
  const quote = { schema_version: 1, branch_id: 1, subtotal_cents: 10100, discount_cents: 0, total_cents: 10100,
    items: [{ product_id: 2, product_name: 'Demo', internal_code: 'DEMO', quantity: 101, list_price_cents: 100, unit_price_cents: 100, promotion_id: null, promotion_name: null, line_total_cents: 10100 }] }
  const request = vi.fn<typeof fetch>().mockResolvedValue(response(quote))
  expect((await createBackendCounterSaleService(request, immediate).quote(token, 1, input.items)).total_cents).toBe(10100)
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ items: input.items })
  await expect(createBackendCounterSaleService(request, immediate).quote(token, 2, input.items)).rejects.toThrow()
})
it('persists before POST and restores/recovers exactly the same intent', async () => {
  const saved = createBackendCounterAttempt(4, 1, input), local = storage()
  const request = vi.fn<typeof fetch>().mockImplementationOnce(async () => { expect(readBackendCounterAttempt(local, 4, 1)).toEqual(saved); return response(receipt, 201) })
    .mockResolvedValueOnce(response({ ...receipt, idempotent_replay: true }))
  const service = createBackendCounterSaleService(request, immediate)
  await service.submit(token, saved, local)
  expect((await service.recover(token, readBackendCounterAttempt(local, 4, 1)!)).idempotent_replay).toBe(true)
  expect(request.mock.calls[1][0]).toBe('/api/v1/sales/recover')
  expect(request.mock.calls[1][1]).toMatchObject({ body: '{}', headers: { 'Idempotency-Key': saved.key }, credentials: 'omit', redirect: 'error' })
  finishBackendCounterAttempt(local, saved)
  expect(readBackendCounterAttempt(local, 4, 1)).toBeNull()
})
it('refuses another pending attempt and storage failure without sending', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response(receipt)), local = storage(), saved = createBackendCounterAttempt(4, 1, input)
  const service = createBackendCounterSaleService(request, immediate)
  await service.submit(token, saved, local)
  await expect(service.submit(token, createBackendCounterAttempt(4, 1, input), local)).rejects.toMatchObject({ code: 'PENDING_ATTEMPT' })
  expect(request).toHaveBeenCalledTimes(1)
  finishBackendCounterAttempt(local, createBackendCounterAttempt(4, 1, input))
  expect(readBackendCounterAttempt(local, 4, 1)).toEqual(saved)
  await expect(service.submit(token, saved, { getItem: () => null, setItem: () => { throw new Error('quota') } })).rejects.toThrow('quota')
  expect(request).toHaveBeenCalledTimes(1)
})
it('conserves attempts on interrupted writes and authoritative price conflict', async () => {
  for (const responseFactory of [() => Promise.reject(new TypeError('network')), () => Promise.resolve(response({ error: 'SERVICE_UNAVAILABLE' }, 503)), () => Promise.resolve(response({ invalid: true }, 201))]) {
    const request = vi.fn<typeof fetch>().mockImplementationOnce(responseFactory), local = storage(), saved = createBackendCounterAttempt(4, 1, input)
    await expect(createBackendCounterSaleService(request, immediate).submit(token, saved, local)).rejects.toMatchObject({ resultUncertain: true })
    expect(readBackendCounterAttempt(local, 4, 1)).toEqual(saved)
    expect(request).toHaveBeenCalledTimes(1)
  }
  const saved = createBackendCounterAttempt(4, 1, input), local = storage()
  await expect(createBackendCounterSaleService(vi.fn<typeof fetch>().mockResolvedValue(response({ error: 'SALE_PRICE_CHANGED' }, 409)), immediate).submit(token, saved, local)).rejects.toMatchObject({ code: 'SALE_PRICE_CHANGED', resultUncertain: false })
  expect(readBackendCounterAttempt(local, 4, 1)).toEqual(saved)
})
it('serializes competing attempts across the storage check and POST', async () => {
  let chain = Promise.resolve()
  const exclusive = <T,>(_name: string, action: () => Promise<T>): Promise<T> => {
    const next = chain.then(action); chain = next.then(() => undefined, () => undefined); return next
  }
  const request = vi.fn<typeof fetch>().mockResolvedValue(response(receipt)), local = storage(), service = createBackendCounterSaleService(request, exclusive)
  const results = await Promise.allSettled([service.submit(token, createBackendCounterAttempt(4, 1, input), local), service.submit(token, createBackendCounterAttempt(4, 1, input), local)])
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
  expect(request).toHaveBeenCalledTimes(1)
})
