import { expect, it, vi } from 'vitest'
import { BackendCashierError, clearBackendPaymentAttempt, readBackendPaymentAttempt, saveBackendPaymentAttempt, createBackendCashierService, createBackendPaymentAttempt, parseBackendPaymentReceipt, parseBackendHistoricalReceipt } from './backend-cashier-service'
const token = 'A'.repeat(43), secret = 'a'.repeat(64), timestamp = '2026-10-01T12:00:00.000Z'
const sale = { id: 1, folio: 'VD-DEMO', branch_id: 2, web_order_id: 3, status: 'PAID', subtotal_cents: 200, discount_cents: 40, total_cents: 160 }
const payment = { id: 4, sale_id: 1, cashier_id: 5, branch_id: 2, claim_id: 6, method: 'CASH', amount_due_cents: 160,
  requested_amount_received_cents: 200, amount_received_cents: 200, change_cents: 40, reference: null, created_at: timestamp }
const receipt = { schema_version: 1, idempotent_replay: false, sale, payment }
const expected = { saleId: 1, cashierId: 5, branchId: 2 }
const input = { claim_token: secret, method: 'CASH' as const, amount_received_cents: 200, reference: null }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

it('reports insufficient inventory as a rejected payment and sends the original request only once', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ error: 'INVENTORY_INSUFFICIENT' }, 409))
  const saved = createBackendPaymentAttempt(1, 5, 2, input)
  await expect(createBackendCashierService(request).pay(token, saved)).rejects.toMatchObject({
    status: 409, code: 'INVENTORY_INSUFFICIENT', resultUncertain: false,
    message: expect.stringContaining('No se registró el pago'),
  })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][1]?.body).toBe(saved.body)
  expect(request.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': saved.key })
})

it('restores the same payment intent only for its cashier/branch and preserves corrupt records', () => {
  let raw: string | null = null
  const storage = { setItem: (_key: string, value: string) => { raw = value }, getItem: () => raw, removeItem: vi.fn(() => { raw = null }) }
  const saved = createBackendPaymentAttempt(1, 5, 2, input)
  saveBackendPaymentAttempt(storage, saved)
  expect(readBackendPaymentAttempt(storage, 5, 2)).toEqual(saved)
  expect(() => readBackendPaymentAttempt(storage, 6, 2)).toThrow(BackendCashierError)
  raw = 'corrupt'
  expect(() => readBackendPaymentAttempt(storage, 5, 2)).toThrow(BackendCashierError)
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(() => saveBackendPaymentAttempt({ setItem: () => { throw new Error('quota') } }, saved)).toThrow('quota')
  clearBackendPaymentAttempt(storage)
  expect(readBackendPaymentAttempt(storage, 5, 2)).toBeNull()
})

it('validates exact server payment and change for the expected sale, cashier and branch', () => {
  expect(parseBackendPaymentReceipt(receipt, expected)).toEqual(receipt)
  for (const changed of [{ change_cents: 41 }, { sale_id: 2 }, { cashier_id: 6 }, { branch_id: 3 }, { amount_due_cents: 161 }, { request_hash: 'secret' }]) {
    expect(() => parseBackendPaymentReceipt({ ...receipt, payment: { ...payment, ...changed } }, expected)).toThrow(BackendCashierError)
  }
  expect(() => parseBackendPaymentReceipt({ ...receipt, sale: { ...sale, status: 'SENT_TO_CASHIER' } }, expected)).toThrow(BackendCashierError)
})
it('supports card and transfer receipts without client cash or change', () => {
  for (const method of ['CARD', 'TRANSFER']) {
    const p = { ...payment, method, requested_amount_received_cents: null, amount_received_cents: 160, change_cents: 0, reference: 'Demo referencia' }
    expect(parseBackendPaymentReceipt({ ...receipt, payment: p }, expected).payment.method).toBe(method)
    expect(() => parseBackendPaymentReceipt({ ...receipt, payment: { ...p, change_cents: 1 } }, expected)).toThrow(BackendCashierError)
  }
})
it('captures a cryptographic immutable payment intent and rejects invalid input', () => {
  const mutable = { ...input }, saved = createBackendPaymentAttempt(1, 5, 2, mutable)
  mutable.amount_received_cents = 300
  expect(JSON.parse(saved.body).amount_received_cents).toBe(200)
  expect(saved.key).toMatch(/^[a-f0-9]{64}$/)
  expect(Object.isFrozen(saved)).toBe(true)
  for (const changed of [{ claim_token: 'uuid' }, { amount_received_cents: 1.1 }, { method: 'CARD', amount_received_cents: 200 }, { method: 'TRANSFER', amount_received_cents: null, reference: null }]) {
    expect(() => createBackendPaymentAttempt(1, 5, 2, { ...input, ...changed } as typeof input)).toThrow(BackendCashierError)
  }
})
it('sends and recovers the same key/body without automatic retries, cookies or redirects', async () => {
  const saved = createBackendPaymentAttempt(1, 5, 2, input)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(receipt, 201)).mockResolvedValueOnce(response({ ...receipt, idempotent_replay: true }))
  const service = createBackendCashierService(request)
  expect((await service.pay(token, saved)).payment.id).toBe(4)
  expect((await service.recover(token, saved)).idempotent_replay).toBe(true)
  expect(request.mock.calls[0]).toEqual(['/api/v1/cashier/sales/1/payments', expect.objectContaining({ body: saved.body, credentials: 'omit', redirect: 'error', headers: expect.objectContaining({ 'Idempotency-Key': saved.key, Authorization: `Bearer ${token}` }) })])
  expect(request.mock.calls[1]).toEqual(['/api/v1/cashier/sales/1/payment-result', expect.objectContaining({ body: '{}', headers: expect.objectContaining({ 'Idempotency-Key': saved.key }) })])
})
it('rejects mismatched payment responses and marks interrupted writes uncertain', async () => {
  const saved = createBackendPaymentAttempt(1, 5, 2, input)
  for (const result of [() => Promise.reject(new TypeError('network')), () => Promise.resolve(response({ ...receipt, payment: { ...payment, cashier_id: 6 } })), () => Promise.resolve(response({ error: 'SERVICE_UNAVAILABLE' }, 503))]) {
    const request = vi.fn<typeof fetch>().mockImplementationOnce(result)
    await expect(createBackendCashierService(request).pay(token, saved)).rejects.toMatchObject({ resultUncertain: true })
    expect(request).toHaveBeenCalledTimes(1)
  }
})
it('validates paginated cashier queue and rejects duplicate/out-of-order rows', async () => {
  const row = { id: 3, folio: 'VD-DEMO', created_by: 5, status: 'SENT_TO_CASHIER', total_cents: 160, created_at: timestamp }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, items: [row], next_before_id: 3 }))
    .mockResolvedValueOnce(response({ schema_version: 1, items: [row, row], next_before_id: null }))
  const service = createBackendCashierService(request)
  expect((await service.list(token, { limit: 1, beforeId: 4 })).next_before_id).toBe(3)
  await expect(service.list(token)).rejects.toThrow(BackendCashierError)
})
it('preserves exact MariaDB decimal quantities and rejects inconsistent detail money', async () => {
  const detailSale = { ...sale, web_order_id: null, subtotal_cents: 160, discount_cents: 0 }
  const item = { id: 7, product_id: 8, product_name: 'Demo', internal_code: 'DEMO', quantity: '0.500', list_price_cents: 320, unit_price_cents: 320, line_total_cents: 160 }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, sale: detailSale, items: [item] }))
    .mockResolvedValueOnce(response({ schema_version: 1, sale: detailSale, items: [{ ...item, quantity: '0.501' }] }))
  const service = createBackendCashierService(request)
  expect((await service.detail(token, 1)).items[0].quantity).toBe('0.500')
  await expect(service.detail(token, 1)).rejects.toThrow(BackendCashierError)
})
it('claims, renews and releases using the returned token and server expiry', async () => {
  const claim = { schema_version: 1, sale_id: 1, branch_id: 2, cashier_id: 5, claim_token: secret, created_at: '2026-10-01T12:00:00.000000Z', expires_at: '2026-10-01T12:05:00.000000Z', server_time: '2026-10-01T12:00:00.000000Z', renewed: false }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(claim)).mockResolvedValueOnce(response({ ...claim, renewed: true }))
    .mockResolvedValueOnce(response({ schema_version: 1, sale_id: 1, closed_reason: 'RELEASED' }))
  const service = createBackendCashierService(request)
  expect((await service.claim(token, 1)).claim_token).toBe(secret)
  expect((await service.claim(token, 1, secret)).renewed).toBe(true)
  expect((await service.release(token, 1, secret)).closed_reason).toBe('RELEASED')
  expect(request.mock.calls.map(c => JSON.parse(String(c[1]?.body)).claim_token)).toEqual([null, secret, secret])
})
it('keeps server authorization and insufficient-cash errors safe and permits cancellation', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ error: 'CASH_AMOUNT_INSUFFICIENT' }, 400)).mockRejectedValueOnce(new DOMException('Abort', 'AbortError'))
  const service = createBackendCashierService(request), saved = createBackendPaymentAttempt(1, 5, 2, input)
  await expect(service.list('bad')).rejects.toMatchObject({ status: 401 })
  await expect(service.pay(token, saved)).rejects.toMatchObject({ code: 'CASH_AMOUNT_INSUFFICIENT', resultUncertain: false })
  const controller = new AbortController(); controller.abort()
  await expect(service.pay(token, saved, controller.signal)).rejects.toMatchObject({ resultUncertain: true })
})

const historicalPayment = { id: 4, sale_id: 1, cashier_id: 5, branch_id: 2, method: 'CASH', amount_due_cents: 160, amount_received_cents: 200, change_cents: 40, reference: null, created_at: timestamp }
const historicalReceipt = { schema_version: 1, sale, payment: historicalPayment,
  items: [{ id: 1, product_id: 1, product_name: 'Planta demo', internal_code: 'DEMO', quantity: '1.000', list_price_cents: 200, unit_price_cents: 160, line_total_cents: 160 }],
  branch: { id: 2, name: 'Demo' }, refund: null }
it('reads historical receipts without needing a payment retry key and validates actor, branch and totals', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response(historicalReceipt))
  const result = await createBackendCashierService(request).receipt(token, 4, { userId: 5, branchId: 2 })
  expect(result.payment.change_cents).toBe(40)
  expect(request.mock.calls[0][0]).toBe('/api/v1/cashier/receipts/4')
  expect(request.mock.calls[0][1]?.method).toBe('GET')
  expect(request.mock.calls[0][1]?.headers).not.toHaveProperty('Idempotency-Key')
  for (const change of [{ cashier_id: 8 }, { branch_id: 3 }, { change_cents: 39 }, { idempotency_key: 'secret' }]) {
    expect(() => parseBackendHistoricalReceipt({ ...historicalReceipt, payment: { ...historicalPayment, ...change } }, 4, { userId: 5, branchId: 2 })).toThrow()
  }
})
it('preserves a refunded or delivered receipt and missing legacy snapshots without guessing current catalog values', () => {
  const value = { ...historicalReceipt, sale: { ...sale, status: 'DELIVERED' }, refund: { id: 2, amount_cents: 160, method: 'CARD' },
    items: [{ ...historicalReceipt.items[0], internal_code: null, list_price_cents: null }] }
  const result = parseBackendHistoricalReceipt(value, 4, { userId: 5, branchId: 2 })
  expect(result.items[0].list_price_cents).toBeNull()
  expect(result.refund?.amount_cents).toBe(160)
  expect(() => parseBackendHistoricalReceipt({ ...value, refund: { ...value.refund, amount_cents: 159 } }, 4, { userId: 5, branchId: 2 })).toThrow()
})
it('uses payment IDs as descending receipt cursors and rejects duplicate or inconsistent pages', async () => {
  const item = { id: 4, sale_id: 1, folio: 'VD-DEMO', method: 'CASH', amount_due_cents: 160, created_at: timestamp }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, items: [item], next_before_id: 4 }))
  expect((await createBackendCashierService(request).receipts(token, { limit: 1 })).next_before_id).toBe(4)
  expect(request.mock.calls[0][0]).toBe('/api/v1/cashier/receipts?limit=1')
  for (const invalid of [{ items: [item, item], next_before_id: null }, { items: [item], next_before_id: 3 }]) {
    const bad = vi.fn<typeof fetch>().mockResolvedValue(response({ schema_version: 1, ...invalid }))
    await expect(createBackendCashierService(bad).receipts(token)).rejects.toThrow()
  }
})
