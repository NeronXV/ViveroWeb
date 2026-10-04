import { beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../auth/backend-runtime'
import { closeCashier, pendingCashierOperation, recoverCashierOperation, completeCashierOperation } from './cashier-operations-service'
const request = vi.fn(), values = new Map<string, string>()
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
const context = { schema_version: 1, user: { id: 2, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE', role: { id: 1, name: 'OWNER', display_name: 'Dueño' }, branch: { id: 3, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: ['OPERATE_CASHIER', 'MANAGE_DISCOUNTS'] }
const receipt = { schema_version: 1, closing: { id: 4, branch_id: 3, cashier_id: 2, opening_cash_cents: 0, counted_cash_cents: 100, cash_sales_cents: 100, card_sales_cents: 0, transfer_sales_cents: 0, cash_refunds_cents: 0, other_refunds_cents: 0, expected_cash_cents: 100, difference_cents: 0, created_at: '2026-10-01T12:00:00.000000Z' }, payment_ids: [1], refund_ids: [], idempotent_replay: true }
beforeEach(() => {
  values.clear(); request.mockReset(); vi.stubGlobal('fetch', request); vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 2, expiresAt: Date.now() + 60000 }, context, accessStatus: 'ready' } as never))
})
it('keeps the original durable closing after a lost response and recovers without creating another', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
  await expect(closeCashier(0, 100, 'ui-key')).rejects.toThrow()
  const pending = pendingCashierOperation()!
  expect(JSON.parse(pending.body)).toEqual({ opening_cash_cents: 0, counted_cash_cents: 100 })
  request.mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
  const recovered = await recoverCashierOperation()
  expect(recovered.attempt).toEqual(pending)
  expect(request.mock.calls[3][0]).toBe('/api/v1/cashier/closings/recover')
  expect(request.mock.calls[3][1].headers['Idempotency-Key']).toBe(pending.key)
  expect(pendingCashierOperation()).toEqual(pending)
  await completeCashierOperation(recovered.attempt)
  expect(pendingCashierOperation()).toBeNull()
})
it('blocks a changed closing body and preserves malformed storage before any write', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
  await expect(closeCashier(0, 100, 'ui-key')).rejects.toThrow()
  const pending = pendingCashierOperation()!
  await expect(closeCashier(0, 200, 'new-ui-key')).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
  expect(pendingCashierOperation()).toEqual(pending)
  storage.setItem('viveroweb_backend_cashier_operation_v1:2:3', '{broken')
  await expect(closeCashier(0, 100, 'ui-key')).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
  expect(storage.getItem('viveroweb_backend_cashier_operation_v1:2:3')).toBe('{broken')
})
