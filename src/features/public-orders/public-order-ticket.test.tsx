import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { PublicOrderTicketContent, requestPublicOrderPrint } from './PublicOrderTicket'
import { createBackendOrderAttempt, createBackendOrderService, parseBackendOrderTicket, readBackendOrderAttempt, readBackendOrderTicket,
  saveBackendOrderAttempt, type BackendOrderTicket } from './backend-order-service'
import { createBackendOrderCoordinator } from './backend-order-coordinator'

const order = { schema_version: 1 as const, id: 4, order_number: 'VW-4', status: 'PENDING' as const, total_cents: 240,
  created_at: '2026-10-09T18:00:00.000000Z', idempotent_replay: true }
const ticket: BackendOrderTicket = { schema_version: 1, order, branch: { id: 1, code: 'TEST', name: 'Sucursal de prueba' },
  subtotal_cents: 300, discount_cents: 60, items: [{ product_id: 2, product_name: 'Nombre al confirmar', quantity: 3,
    list_price_cents: 100, unit_price_cents: 80, line_total_cents: 240 }] }
const input = { branch_id: 1, items: [{ product_id: 2, quantity: 3 }], customer_name: 'Cliente ficticio',
  customer_phone: null, customer_email: 'demo@example.invalid', notes: null, expected_total_cents: 240 }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear(), key: () => null, get length() { return values.size } }
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const lock = <T,>(work: () => Promise<T>) => work()

it('retains the original attempt if the receipt fetch fails, then recovers and durably saves historical items without another order POST', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(order, 201))
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(order)).mockResolvedValueOnce(response(ticket))
  const service = createBackendOrderService(request, true)
  await expect(createBackendOrderCoordinator(saved, service, lock).send(attempt)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  const result = await createBackendOrderCoordinator(saved, service, lock).recover(attempt)
  expect(result.ticket).toEqual(ticket)
  expect(readBackendOrderAttempt(saved)).toBeNull()
  expect(readBackendOrderTicket(saved)).toEqual(ticket)
  expect(request.mock.calls.map(call => call[0])).toEqual(['/api/v1/web-orders', '/api/v1/web-orders/ticket', '/api/v1/web-orders/recover', '/api/v1/web-orders/ticket'])
  expect(request.mock.calls[1][1]).toMatchObject({ body: '{}', credentials: 'omit', cache: 'no-store', headers: { 'Idempotency-Key': attempt.key } })
  expect(String(request.mock.calls[1][0])).not.toContain(attempt.key)
})

it('keeps recovery available if durable receipt storage fails or the returned branch/items differ', async () => {
  for (const invalid of [null, { ...ticket, branch: { ...ticket.branch, id: 2 } }, { ...ticket, items: [{ ...ticket.items[0], product_id: 3 }] }]) {
    const saved = storage(), attempt = createBackendOrderAttempt(input)
    saveBackendOrderAttempt(saved, attempt)
    if (!invalid) saved.setItem = () => { throw new Error('quota') }
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(order)).mockResolvedValueOnce(response(invalid ?? ticket))
    await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request, true), lock).recover(attempt)).rejects.toThrow()
    expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  }
})

it('rejects corrupt monetary snapshots instead of using current cart prices', () => {
  for (const value of [{ ...ticket, subtotal_cents: 301 }, { ...ticket, discount_cents: 61 },
    { ...ticket, items: [ticket.items[0], ticket.items[0]] }, { ...ticket, items: [{ ...ticket.items[0], quantity: 2 }] },
    { ...ticket, order: { ...order, total_cents: 241 } }]) expect(() => parseBackendOrderTicket(value)).toThrow()
})

it('prints only the selected portal, cleans up on failure and permits repeated printing without service calls', () => {
  const classes = () => { const values = new Set<string>(); return { add: (...names: string[]) => names.forEach(n => values.add(n)),
    remove: (...names: string[]) => names.forEach(n => values.delete(n)), contains: (n: string) => values.has(n) } }
  const body = { classList: classes() } as unknown as HTMLElement, portal = { classList: classes() } as unknown as HTMLElement
  const print = vi.fn(() => {
    expect(body.classList.contains('print-public-order')).toBe(true)
    expect(portal.classList.contains('public-order-ticket-selected')).toBe(true)
  })
  requestPublicOrderPrint(print, body, portal, 'pdf'); requestPublicOrderPrint(print, body, portal, 'thermal')
  expect(print).toHaveBeenCalledTimes(2)
  expect(body.classList.contains('print-public-order')).toBe(false)
  expect(() => requestPublicOrderPrint(() => { throw new Error('printer') }, body, portal, 'pdf')).toThrow('printer')
  expect(portal.classList.contains('public-order-ticket-selected')).toBe(false)
  body.classList.add('print-cashier-ticket')
  requestPublicOrderPrint(print, body, portal, 'pdf')
  expect(print).toHaveBeenCalledTimes(2)
})

it('renders confirmed products, date, branch, quantities, prices and total independently of the cart', () => {
  const html = renderToStaticMarkup(<PublicOrderTicketContent ticket={ticket} />)
  for (const content of ['VW-4', 'Sucursal de prueba', 'Nombre al confirmar', '3 ×', '0.80', '2.40', 'Pendiente de pago en sucursal', 'Fecha del pedido']) expect(html).toContain(content)
  expect(html).not.toContain(input.customer_email)
  expect(html).not.toContain('<button')
})

