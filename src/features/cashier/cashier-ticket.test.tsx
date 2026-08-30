import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CashierPrintableTicket } from './CashierPrintableTicket'
import { buildCashierTicket, requestCashierTicketPrint } from './cashier-ticket'
import type { CashierPaymentResultResponse } from './cashier-types'

function result(method: 'CASH' | 'TRANSFER' = 'CASH'): CashierPaymentResultResponse {
  return {
    schemaVersion: 1,
    status: 'SUCCEEDED',
    sale: {
      id: '52000000-0000-0000-0000-000000000001',
      folio: 'VD-1042',
      createdAt: '2026-08-29T14:00:00Z',
      totalCents: 13500,
      createdByLabel: 'Operador actual',
    },
    items: [
      {
        id: '53000000-0000-0000-0000-000000000001',
        productName: 'Monstera',
        quantity: 2,
        unitPriceCents: 7000,
        lineTotalCents: 14000,
      },
    ],
    branch: { name: 'Sucursal Centro' },
    payment: method === 'CASH' ? {
      method: 'CASH',
      amountReceivedCents: 15000,
      changeCents: 1500,
      reference: null,
      createdAt: '2026-08-29T14:05:00Z',
    } : {
      method: 'TRANSFER',
      amountReceivedCents: null,
      changeCents: null,
      reference: 'SPEI-ABC-123',
      createdAt: '2026-08-29T14:05:00Z',
    },
    serverTime: '2026-08-29T14:05:01Z',
  }
}

describe('ticket interno de Caja', () => {
  it('sólo construye el ticket desde un resultado canónico SUCCEEDED', () => {
    expect(buildCashierTicket({ schemaVersion: 1, status: 'NOT_FOUND', serverTime: '2026-08-29T14:05:01Z' })).toBeNull()
    expect(buildCashierTicket(result())?.folio).toBe('VD-1042')
  })

  it('calcula subtotal y descuento desde las partidas y conserva el total autoritativo', () => {
    const ticket = buildCashierTicket(result())

    expect(ticket).toMatchObject({ subtotalCents: 14000, discountCents: 500, totalCents: 13500 })
    expect(ticket?.items).toEqual([{
      id: '53000000-0000-0000-0000-000000000001',
      productName: 'Monstera',
      quantity: 2,
      unitPriceCents: 7000,
      lineTotalCents: 14000,
    }])
    expect('unit' in (ticket?.items[0] ?? {})).toBe(false)
  })

  it('presenta efectivo recibido y cambio sin datos operativos sensibles', () => {
    const ticket = buildCashierTicket(result())
    const serialized = JSON.stringify(ticket)

    expect(ticket).toMatchObject({ method: 'CASH', amountReceivedCents: 15000, changeCents: 1500, reference: null })
    expect(serialized).not.toContain('idempotency')
    expect(serialized).not.toContain('claim')
    expect(serialized).not.toContain('cashier_id')
    expect(serialized).not.toContain('saleId')
  })

  it('presenta transferencia y su referencia sin importes de efectivo', () => {
    const ticket = buildCashierTicket(result('TRANSFER'))

    expect(ticket).toMatchObject({ method: 'TRANSFER', reference: 'SPEI-ABC-123', amountReceivedCents: null, changeCents: null })
  })

  it('renderiza partidas, totales y leyenda interna sin unit', () => {
    const html = renderToStaticMarkup(<CashierPrintableTicket result={result()} />)

    expect(html).toContain('Comprobante interno — sin validez fiscal')
    expect(html).toContain('Monstera')
    expect(html).toContain('Descuento')
    expect(html).toContain('Imprimir ticket')
    expect(html).not.toContain('unit')
  })

  it('no imprime durante el render y sólo invoca impresión mediante la acción explícita', () => {
    const print = vi.fn()
    const classList = { add: vi.fn(), remove: vi.fn() }
    renderToStaticMarkup(<CashierPrintableTicket result={result()} />)
    expect(print).not.toHaveBeenCalled()

    requestCashierTicketPrint(print, { classList } as unknown as HTMLElement)
    expect(print).toHaveBeenCalledTimes(1)
    expect(classList.add).toHaveBeenCalledWith('print-cashier-ticket')
    expect(classList.remove).toHaveBeenCalledWith('print-cashier-ticket')
  })
})
