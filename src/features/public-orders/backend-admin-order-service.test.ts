import { expect, it, vi } from 'vitest'
import { BackendAdminOrderError, createBackendAdminOrderService, parseBackendAdminOrderDetail } from './backend-admin-order-service'

const token = 'A'.repeat(43), timestamp = '2026-10-01T12:00:00.000000Z'
const order = { id: 3, branch_id: 1, customer_name: 'Demo', customer_phone: null, customer_email: 'demo@example.invalid', notes: null,
  status: 'PENDING', revision: 0, cashier_sale_id: null, subtotal_cents: 200, discount_cents: 40, total_cents: 160, created_at: timestamp, updated_at: timestamp }
const item = { id: 1, product_id: 2, product_name: 'Demo', internal_code: 'DEMO', quantity: 2, list_price_cents: 100, unit_price_cents: 80,
  discount_cents: 40, line_total_cents: 160, promotion_id: 4, promotion_name: 'Demo' }
const detail = { schema_version: 1, order, items: [item], history: [{ revision: 0, previous_status: null, new_status: 'PENDING', changed_by: null, observation: null, changed_at: timestamp }] }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

it('validates detail snapshots, exact money and ordered revision history', () => {
  expect(parseBackendAdminOrderDetail(detail, 3)).toEqual(detail)
  for (const change of [{ order: { ...order, id: 'uuid' } }, { order: { ...order, total_cents: 161 } }, { order: { ...order, revision: 1 } },
    { items: [item, item] }, { items: [{ ...item, line_total_cents: 159 }] }, { history: [{ ...detail.history[0], new_status: 'READY' }] },
    { order: { ...order, created_at: '2026-02-30T12:00:00.000000Z' } }]) expect(() => parseBackendAdminOrderDetail({ ...detail, ...change }, 3)).toThrow(BackendAdminOrderError)
  expect(() => parseBackendAdminOrderDetail(detail, 4)).toThrow(BackendAdminOrderError)
})
it('requests branch/status filtered descending pages with API bearer only', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ schema_version: 1, items: [order], next_before_id: 3 }))
  const result = await createBackendAdminOrderService(request).list(token, { limit: 1, beforeId: 4, branchId: 1, status: 'PENDING' })
  expect(result.next_before_id).toBe(3)
  expect(request.mock.calls[0][0]).toBe('/api/v1/admin/web-orders?limit=1&before_id=4&branch_id=1&status=PENDING')
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
})
it('rejects repeated, out-of-scope or invalid pagination results', async () => {
  for (const value of [{ schema_version: 1, items: [order, order], next_before_id: null }, { schema_version: 1, items: [order], next_before_id: 2 },
    { schema_version: 1, items: [{ ...order, branch_id: 2 }], next_before_id: null }]) {
    await expect(createBackendAdminOrderService(vi.fn<typeof fetch>().mockResolvedValue(response(value))).list(token, { branchId: 1 })).rejects.toThrow(BackendAdminOrderError)
  }
})
it('uses optimistic revision and verifies status result belongs to the requested order', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ id: 3, status: 'CONFIRMED', revision: 1, idempotent_replay: false }))
    .mockResolvedValueOnce(response({ id: 4, status: 'CONFIRMED', revision: 1, idempotent_replay: false }))
  const service = createBackendAdminOrderService(request), input = { status: 'CONFIRMED' as const, expected_revision: 0, observation: null }
  expect((await service.update(token, 3, input)).revision).toBe(1)
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(input)
  await expect(service.update(token, 3, input)).rejects.toMatchObject({ resultUncertain: true })
})
it('preserves server conflict, authorization and payment errors without granting UI permissions', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'BRANCH_FORBIDDEN'], [409, 'WEB_ORDER_VERSION_CONFLICT'], [409, 'WEB_ORDER_PAYMENT_REQUIRED'], [409, 'WEB_ORDER_ALREADY_IN_CASHIER']] as const) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ error: code }, status))
    await expect(createBackendAdminOrderService(request).update(token, 3, { status: 'COMPLETED', expected_revision: 2, observation: null })).rejects.toMatchObject({ status, resultUncertain: false })
    expect(request).toHaveBeenCalledTimes(1)
  }
})
it('validates cashier receipt and sends an empty body without trusting client totals', async () => {
  const receipt = { schema_version: 1, order_id: 3, sale_id: 7, folio: 'VD-DEMO', status: 'SENT_TO_CASHIER', total_cents: 160, idempotent_replay: true }
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(receipt)).mockResolvedValueOnce(response({ ...receipt, order_id: 4 }))
  const service = createBackendAdminOrderService(request)
  expect(await service.sendToCashier(token, 3)).toEqual(receipt)
  expect(request.mock.calls[0][0]).toBe('/api/v1/admin/web-orders/3/send-to-cashier')
  expect(request.mock.calls[0][1]?.body).toBe('{}')
  await expect(service.sendToCashier(token, 3)).rejects.toMatchObject({ resultUncertain: true })
})
it('does not send invalid IDs or sessions and preserves uncertainty after interrupted writes', async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'))
  const service = createBackendAdminOrderService(request)
  await expect(service.detail('invalid', 3)).rejects.toMatchObject({ status: 401 })
  await expect(service.detail(token, 0)).rejects.toThrow(BackendAdminOrderError)
  expect(request).not.toHaveBeenCalled()
  const controller = new AbortController(); controller.abort()
  await expect(service.sendToCashier(token, 3, controller.signal)).rejects.toMatchObject({ resultUncertain: true })
  expect((request.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true)
})
