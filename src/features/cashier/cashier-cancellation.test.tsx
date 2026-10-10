import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { bindBackendSession } from '../auth/backend-runtime'
import { cancelPendingSale, pendingCashierOperation, recoverCashierOperation, completeCashierOperation } from './cashier-operations-service'
import { createBackendCashierOperationAttempt, parseBackendCancellation } from './backend-cashier-operations-service'
import { cancellationAllowed } from './cashier-cancellation-service'
import { CashierSaleCancellation, CancellationConfirmation } from './CashierSaleCancellation'
import { PublicOrderTicketContent } from '../public-orders/PublicOrderTicket'
import { fetchCashierSaleDetail } from './cashier-service'
const request = vi.fn(), values = new Map<string, string>()
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
const context = { schema_version: 1, user: { id: 2, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE', role: { id: 1, name: 'OWNER', display_name: 'Dueño' }, branch: { id: 3, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: ['OPERATE_CASHIER', 'MANAGE_DISCOUNTS'] }
const input = { reason: 'Cliente cambió de opinión' }
const receipt = { schema_version: 1, idempotent_replay: true,
  sale: { id: 8, folio: 'VD-0008', branch_id: 3, status: 'CANCELLED', total_cents: 100 },
  cancellation: { id: 9, sale_id: 8, branch_id: 3, cancelled_by: 2, reason: input.reason, created_at: '2026-10-09T12:00:00.000000Z' }, web_order_id: null }
beforeEach(() => {
  values.clear(); request.mockReset(); vi.stubGlobal('fetch', request); vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 2, expiresAt: Date.now() + 60000 }, context, accessStatus: 'ready' } as never))
})
it('persists before sending, survives a lost response and recovers without another write', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockImplementationOnce(async () => {
    expect(pendingCashierOperation()?.body).toBe(JSON.stringify(input))
    throw new TypeError('offline after commit')
  })
  await expect(cancelPendingSale('8', input.reason)).rejects.toThrow()
  const saved = pendingCashierOperation()!
  expect(saved.kind).toBe('cancel')
  request.mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
  const result = await recoverCashierOperation()
  expect(result.attempt).toEqual(saved)
  expect(request.mock.calls[3][0]).toBe('/api/v1/cashier/sales/8/cancellation-result')
  expect(request.mock.calls[3][1].headers['Idempotency-Key']).toBe(saved.key)
  expect(pendingCashierOperation()).toEqual(saved)
  await completeCashierOperation(result.attempt)
  expect(pendingCashierOperation()).toBeNull()
})
it('retries the original intent only after a not-found recovery, rejecting changed payloads', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
  await expect(cancelPendingSale('8', input.reason)).rejects.toThrow()
  const saved = pendingCashierOperation()!
  await expect(cancelPendingSale('8', 'Otro motivo')).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
  request.mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ error: 'CANCELLATION_NOT_FOUND' }, { status: 404 }))
    .mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json(receipt))
  await recoverCashierOperation()
  expect(request.mock.calls[5][1].body).toBe(saved.body)
  expect(request.mock.calls[5][1].headers['Idempotency-Key']).toBe(saved.key)
})
it('clears only a definite safe rejection; uncertain or incompatible results stay pending', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ error: 'CANCELLATION_REFUND_REQUIRED' }, { status: 409 }))
  await expect(cancelPendingSale('8', input.reason)).rejects.toThrow('devolución')
  expect(pendingCashierOperation()).toBeNull()
  request.mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ ...receipt, sale: { ...receipt.sale, status: 'PAID' } }))
  await expect(cancelPendingSale('8', input.reason)).rejects.toThrow()
  expect(pendingCashierOperation()?.kind).toBe('cancel')
})
it('rejects a receipt for another user, branch, sale, reason or paid status', () => {
  const attempt = createBackendCashierOperationAttempt({ userId: 2, branchId: 3 }, 'cancel', input, 8)
  expect(parseBackendCancellation(receipt, attempt).sale.folio).toBe('VD-0008')
  for (const changed of [{ cancelled_by: 99 }, { branch_id: 99 }, { sale_id: 99 }, { reason: 'Otro motivo' }]) {
    expect(() => parseBackendCancellation({ ...receipt, cancellation: { ...receipt.cancellation, ...changed } }, attempt)).toThrow()
  }
  expect(() => parseBackendCancellation({ ...receipt, sale: { ...receipt.sale, status: 'PAID' } }, attempt)).toThrow()
})
it('requires positive backend authorization; older API, forbidden and errors never enable it', async () => {
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, sale_id: 8, can_cancel: true, blocked_reason: null }))
  expect(await cancellationAllowed('8')).toBe(true)
  for (const status of [403, 404]) {
    request.mockResolvedValueOnce(Response.json({ error: 'NOT_FOUND' }, { status }))
    expect(await cancellationAllowed('8')).toBe(false)
  }
  request.mockResolvedValueOnce(Response.json({ schema_version: 1, sale_id: 99, can_cancel: true, blocked_reason: null }))
  await expect(cancellationAllowed('8')).rejects.toThrow()
})
it('restores a visible recovery action even when the cancelled sale left the queue', async () => {
  request.mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
  await expect(cancelPendingSale('8', input.reason)).rejects.toThrow()
  const html = renderToStaticMarkup(<CashierSaleCancellation sale={null} available={false} onLocked={() => {}} onFinished={() => {}} />)
  expect(html).toContain('Consultar cancelación pendiente')
  expect(html).not.toContain('idempotency')
  expect(html).not.toContain(pendingCashierOperation()!.key)
})
it('shows a cancelled linked public receipt without inviting another payment', () => {
  const html = renderToStaticMarkup(<PublicOrderTicketContent ticket={{ schema_version: 1,
    order: { schema_version: 1, id: 8, order_number: 'VW-0008', status: 'CANCELLED', total_cents: 100, created_at: '2026-10-09T12:00:00.000000Z', idempotent_replay: true },
    branch: { id: 3, code: 'DEMO', name: 'Sucursal de ensayo' }, subtotal_cents: 100, discount_cents: 0,
    items: [{ product_id: 1, product_name: 'Planta ficticia', quantity: 1, list_price_cents: 100, unit_price_cents: 100, line_total_cents: 100 }] }} />)
  expect(html).toContain('Pedido cancelado')
  expect(html).not.toContain('Pendiente de pago en sucursal')
  expect(html).not.toContain('para pagar y recoger')
})
it('requires a reason and explicit no-money confirmation with a secondary action', () => {
  const sale = { id: '8', folio: 'VD-0008', createdAt: '2026-10-09T12:00:00Z', totalCents: 12050, itemCount: 1,
    status: 'SENT_TO_CASHIER', createdByLabel: null, claimState: 'AVAILABLE' as const, claimExpiresAt: null, serverTime: '2026-10-09T12:00:00Z' }
  const html = renderToStaticMarkup(<CancellationConfirmation sale={sale} reason="" busy={false} onReason={() => {}} onConfirm={() => {}} />)
  expect(html).toContain('VD-0008'); expect(html).toContain('120.50')
  expect(html).toMatch(/textarea[^>]*minLength="3"[^>]*maxLength="240"[^>]*required=""/)
  expect(html).toMatch(/input[^>]*type="checkbox"[^>]*required=""/)
  expect(html).toContain('no se recibió dinero')
  expect(html).toContain('retry-btn-secondary')
  expect(renderToStaticMarkup(<CancellationConfirmation sale={sale} reason="Motivo confirmado" busy={true} onReason={() => {}} onConfirm={() => {}} />)).toContain('<fieldset disabled="">')
})
it('explains cancelled, paid and uncertain stale selections before enabling collection', async () => {
  for (const [status, message] of [['CANCELLED', 'cancelada'], ['PAID', 'cobrada'], ['PAYMENT_PENDING', 'conciliación']]) {
    request.mockResolvedValueOnce(Response.json({ schema_version: 1, sale: { ...receipt.sale, status } }))
    await expect(fetchCashierSaleDetail('8')).rejects.toThrow(message)
  }
})
