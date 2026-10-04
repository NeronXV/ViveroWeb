import { beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../auth/backend-runtime'
import { loadAdminWebOrders, setAdminWebOrderStatus } from './web-order-service'
const request = vi.fn(), time = '2026-10-01T12:00:00.000000Z'
const order = { id: 3, branch_id: 1, customer_name: 'Demo', customer_phone: null, customer_email: null, notes: null, status: 'PENDING', revision: 0, cashier_sale_id: null, subtotal_cents: 100, discount_cents: 0, total_cents: 100, created_at: time, updated_at: time }
const detail = { schema_version: 1, order, items: [{ id: 1, product_id: 2, product_name: 'Demo', internal_code: 'DEMO', quantity: 1, list_price_cents: 100, unit_price_cents: 100, discount_cents: 0, line_total_cents: 100, promotion_id: null, promotion_name: null }], history: [{ revision: 0, previous_status: null, new_status: 'PENDING', changed_by: null, observation: null, changed_at: time }], operation: { branch: { id: 1, code: 'DEMO', name: 'Sucursal demo' }, checkout: null, server_time: time, order_number: 'VW-3' } }
beforeEach(() => {
  vi.stubGlobal('fetch', request); request.mockReset()
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 1, expiresAt: Date.now() + 60000 }, context: { user: { id: 1 } }, accessStatus: 'ready' } as never))
})
it('loads actual branch and revision without claiming a client clock is server time', async () => {
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, items: [order], next_before_id: null })).mockResolvedValueOnce(Response.json(detail))
  const result = await loadAdminWebOrders()
  expect(result.items[0]).toMatchObject({ id: '3', revision: 0, branch: { id: '1', name: 'Sucursal demo' }, checkout: null })
  expect(result.serverTime).toBe('2026-10-01T12:00:00.000Z')
  expect(request.mock.calls[1][0]).toBe('/api/v1/admin/web-orders/3?view=operations')
})
it('sends the displayed revision and stops at a concurrent update conflict', async () => {
  request.mockResolvedValueOnce(Response.json({ error: 'WEB_ORDER_VERSION_CONFLICT' }, { status: 409 }))
  await expect(setAdminWebOrderStatus('3', 'CONFIRMED', 0)).rejects.toMatchObject({ code: 'WEB_ORDER_VERSION_CONFLICT' })
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ status: 'CONFIRMED', expected_revision: 0, observation: null })
  expect(request).toHaveBeenCalledTimes(1)
})
it('rejects a checkout or branch from another order instead of showing guessed data', async () => {
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, items: [order], next_before_id: null })).mockResolvedValueOnce(Response.json({ ...detail, operation: { ...detail.operation, branch: { id: 2, code: 'OTHER', name: 'Otra' } } }))
  await expect(loadAdminWebOrders()).rejects.toMatchObject({ code: 'INCOMPATIBLE_RESPONSE' })
})
