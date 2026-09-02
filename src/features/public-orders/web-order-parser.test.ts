import { describe, expect, it } from 'vitest'
import { parseAdminWebOrders, parsePublicOrderOptions, parseSubmitWebOrderResult } from './web-order-parser'

const branch = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'CENTRO',
  name: 'Sucursal Centro',
}

describe('web order boundary parsers', () => {
  it('parses public branches and an idempotent order confirmation', () => {
    expect(parsePublicOrderOptions({ schemaVersion: 1, branches: [branch] }).branches).toEqual([branch])
    expect(parseSubmitWebOrderResult({
      schemaVersion: 1,
      orderId: '22222222-2222-4222-8222-222222222222',
      orderNumber: 'VW-2222222222',
      status: 'PENDING',
      totalCents: 12500,
      createdAt: '2026-09-01T12:00:00Z',
      idempotentReplay: true,
    })).toMatchObject({ status: 'PENDING', totalCents: 12500, idempotentReplay: true })
  })

  it('rejects unknown public order states', () => {
    expect(() => parseSubmitWebOrderResult({
      schemaVersion: 1,
      orderId: '22222222-2222-4222-8222-222222222222',
      orderNumber: 'VW-2222222222',
      status: 'PAID',
      totalCents: 12500,
      createdAt: '2026-09-01T12:00:00Z',
      idempotentReplay: false,
    })).toThrow('estado')
  })

  it('parses protected order detail with cent-based totals', () => {
    const response = parseAdminWebOrders({
      schemaVersion: 1,
      items: [{
        id: '22222222-2222-4222-8222-222222222222',
        orderNumber: 'VW-2222222222',
        branch,
        customer: { name: 'Cliente sintético', phone: '614 000 0000', email: null },
        notes: null,
        subtotalCents: 15000,
        discountCents: 2500,
        totalCents: 12500,
        status: 'CONFIRMED',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:01:00Z',
        items: [{
          productId: '33333333-3333-4333-8333-333333333333',
          name: 'Producto sintético',
          code: 'TEST-1',
          quantity: 1,
          listPriceCents: 15000,
          unitPriceCents: 12500,
          promotionName: 'Prueba',
          lineTotalCents: 12500,
        }],
      }],
      page: { limit: 100, hasMore: false, nextCursor: null },
      serverTime: '2026-09-01T12:01:00Z',
    })

    expect(response.items[0]).toMatchObject({ status: 'CONFIRMED', totalCents: 12500 })
    expect(response.items[0].items[0].unitPriceCents).toBe(12500)
  })
})
