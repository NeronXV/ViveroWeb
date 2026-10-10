import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CashierPendingList } from './CashierPendingList'
import { CashierPaymentPanel, type CashierPaymentPanelProps } from './CashierPaymentPanel'
import { CashierSaleSummary } from './CashierSaleSummary'
import { interruptedCashierPayments, cashierWorkerMessage } from './cashier-desk-state'
import { createPaymentAttempt, savePaymentAttempt } from './cashier-payment-state'
import { parseCashierSalesResponse } from './cashier-parser'
import { CashierSalesCoordinator } from './useCashierSales'
const sale = { id: '8', folio: 'VD-0008', createdAt: '2026-10-09T12:00:00Z', totalCents: 61000, itemCount: 2,
  status: 'SENT_TO_CASHIER', createdByLabel: 'Usuario ficticio', claimState: 'AVAILABLE' as const, claimExpiresAt: null, serverTime: '2026-10-09T12:00:00Z' }
const pending = createPaymentAttempt('2', '8', 'a'.repeat(64))
const panel: CashierPaymentPanelProps = { attempt: { ...pending, status: 'CLAIMED', claimToken: 'b'.repeat(64) }, busy: false, detailReady: true, blockedByOther: false,
  method: 'CASH', received: '700.00', reference: '', total: 61000, change: 9000, enoughCash: true, error: null, payloadLocked: false,
  onMethod: () => {}, onReceived: () => {}, onReference: () => {}, onConfirm: () => {}, onOpen: () => {}, onCheck: () => {}, onBack: () => {}, onFinish: () => {}, onReload: () => {} }
function memory() {
  const values = new Map<string, string>()
  return { get length() { return values.size }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) }, values }
}
it('pending rows have separate charge/detail actions and accurate origin without technical states', () => {
  const html = renderToStaticMarkup(<CashierPendingList sales={[{ ...sale, origin: 'WEB_ORDER' }, { ...sale, id: '9', folio: 'VD-0009', origin: 'DIRECT_SALE', claimState: 'CLAIMED_BY_OTHER' }]} locked={false} onCharge={() => {}} onDetail={() => {}} />)
  expect(html).toContain('VD-0008'); expect(html).toContain('610.00'); expect(html).toContain('Pedido web'); expect(html).toContain('Venta directa')
  expect(html).toContain('Venta en atención'); expect(html).toContain('Cobrar venta'); expect(html).toContain('Ver detalle')
  expect(html).toMatch(/disabled=""[^>]*>Cobrar venta/)
  expect(html).not.toMatch(/Reclamar|CLAIMED|Idempotencia/)
})
it('cash requires only amount and explicit confirmation, showing the change', () => {
  const html = renderToStaticMarkup(<CashierPaymentPanel {...panel} />)
  expect(html).toContain('Efectivo recibido'); expect(html).toContain('90.00'); expect(html).toContain('Confirmar cobro')
  expect(html).toMatch(/type="checkbox" required=""/); expect(html).not.toContain('Referencia de transferencia')
})
it('a blocked desk disables the payment form and its navigation', () => {
  const html = renderToStaticMarkup(<CashierPaymentPanel {...panel} busy />)
  expect(html).toContain('<fieldset disabled="">')
  expect(html).toMatch(/disabled=""[^>]*>Volver a ventas pendientes/)
})
it('card reference stays optional while transfer requires it, and neither requests cash', () => {
  for (const method of ['CARD', 'TRANSFER'] as const) {
    const html = renderToStaticMarkup(<CashierPaymentPanel {...panel} method={method} />)
    expect(html).not.toContain('Efectivo recibido')
    expect(html).toContain(method === 'CARD' ? 'Referencia de autorización (opcional)' : 'Referencia de transferencia')
    const input = html.match(/<input type="text"[^>]*>/)![0]
    expect(input.includes('required')).toBe(method === 'TRANSFER')
  }
})
it('uncertain and confirming states expose critical notices and never another collection or back action', () => {
  for (const status of ['UNCERTAIN', 'CONFIRMING'] as const) {
    const html = renderToStaticMarkup(<CashierPaymentPanel {...panel} attempt={{ ...pending, status }} />)
    expect(html).not.toContain('<form'); expect(html).not.toContain('Confirmar cobro'); expect(html).not.toContain('Volver a ventas pendientes')
    expect(html).toContain(status === 'UNCERTAIN' ? 'Comprobar resultado' : 'Registrando pago')
  }
})
it('expired attention permits reopening and recovered payloads remain locked', () => {
  expect(renderToStaticMarkup(<CashierPaymentPanel {...panel} attempt={{ ...pending, status: 'EXPIRED' }} />)).toContain('Volver a abrir cobro')
  const html = renderToStaticMarkup(<CashierPaymentPanel {...panel} payloadLocked />)
  expect(html).toMatch(/type="radio"[^>]*disabled=""/)
  expect(html).toMatch(/type="text"[^>]*disabled=""/)
})
it('reopening discovers earlier uncertain attempts for this user without modifying their journal', () => {
  const storage = memory()
  savePaymentAttempt(storage, { ...pending, status: 'CONFIRMING', claimToken: 'b'.repeat(64), method: 'CASH', amountReceivedCents: 70000 })
  savePaymentAttempt(storage, { ...pending, saleId: '9', status: 'UNCERTAIN', claimToken: 'b'.repeat(64) })
  savePaymentAttempt(storage, { ...pending, userId: '3', saleId: '10', status: 'UNCERTAIN', claimToken: 'b'.repeat(64) })
  const before = [...storage.values.entries()]
  expect(interruptedCashierPayments(storage, '2').map(row => row.saleId)).toEqual(['8', '9'])
  expect([...storage.values.entries()]).toEqual(before)
  storage.setItem('viveroweb_backend_cashier_attempt_v1:2:8', '{broken')
  expect(() => interruptedCashierPayments(storage, '2')).toThrow()
  expect(storage.getItem('viveroweb_backend_cashier_attempt_v1:2:8')).toBe('{broken')
})
it('new origin metadata validates strictly while old payloads remain valid', () => {
  const payload = { schemaVersion: 1, items: [sale], page: { limit: 25, hasMore: false, nextCursor: null } }
  expect(parseCashierSalesResponse(payload).items[0].origin).toBeUndefined()
  expect(parseCashierSalesResponse({ ...payload, items: [{ ...sale, origin: 'WEB_ORDER' }] }).items[0].origin).toBe('WEB_ORDER')
  expect(() => parseCashierSalesResponse({ ...payload, items: [{ ...sale, origin: 'ANDROID_GUESSED' }] })).toThrow()
})
it('changing folio clears cursor and rejects stale searches through the existing coordinator', async () => {
  vi.useFakeTimers()
  const changes = vi.fn(), fetchCall = vi.fn().mockResolvedValue({ items: [], page: { nextCursor: null, hasMore: false } })
  const coordinator = new CashierSalesCoordinator({ limit: 15, fetchCall, onStateChange: changes })
  try {
    coordinator.resetScope('2', '3', 'VD-0008'); await vi.advanceTimersByTimeAsync(1)
    coordinator.resetScope('2', '3', 'VD-LEGACY'); await vi.advanceTimersByTimeAsync(1)
    expect(fetchCall.mock.calls[0][0]).toEqual({ limit: 15, cursor: null, folio: 'VD-0008' })
    expect(fetchCall.mock.calls[1][0]).toEqual({ limit: 15, cursor: null, folio: 'VD-LEGACY' })
    expect(changes.mock.calls.at(-1)![0].items).toEqual([])
  } finally { coordinator.destroy(); vi.useRealTimers() }
})
it('summary uses confirmed products and values and keeps old journal warnings understandable', () => {
  const html = renderToStaticMarkup(<CashierSaleSummary detail={{ schemaVersion: 1, sale, items: [{ id: '1', productName: 'Monstera', quantity: 1, unitPriceCents: 25000, lineTotalCents: 25000 }, { id: '2', productName: 'Sansevieria', quantity: 2, unitPriceCents: 18000, lineTotalCents: 36000 }] }} />)
  expect(html).toContain('Monstera'); expect(html).toContain('Sansevieria'); expect(html).toContain('610.00')
  expect(cashierWorkerMessage('No hay comprobante canónico ni claim verificable.')).not.toMatch(/canónico|claim/i)
})
