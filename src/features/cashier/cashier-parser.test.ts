import { describe, expect, it } from 'vitest'
import { parseCashierSaleDetailResponse, parseCashierSalesResponse } from './cashier-parser'

const SALE_ID = '52000000-0000-0000-0000-000000000001'
const ITEM_ID = '82000000-0000-0000-0000-000000000001'

function validSalesPayload(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    items: [
      {
        id: SALE_ID,
        folio: 'V-001',
        createdAt: '2026-08-28T09:00:00Z',
        totalCents: 15000,
        itemCount: 2,
        status: 'SENT_TO_CASHIER',
        createdByLabel: 'Pedro Pérez',
        claimState: 'AVAILABLE',
        claimExpiresAt: null,
        serverTime: '2026-08-28T09:05:00Z',
      },
    ],
    page: {
      limit: 25,
      hasMore: true,
      nextCursor: {
        createdAt: '2026-08-28T09:00:00Z',
        id: SALE_ID,
      },
    },
  }
}

function validDetailPayload(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sale: {
      id: SALE_ID,
      folio: 'V-001',
      createdAt: '2026-08-28T09:00:00Z',
      totalCents: 15000,
      itemCount: 2,
      status: 'SENT_TO_CASHIER',
      createdByLabel: 'Pedro Pérez',
      claimState: 'AVAILABLE',
      claimExpiresAt: null,
      serverTime: '2026-08-28T09:05:00Z',
    },
    items: [
      {
        id: ITEM_ID,
        productName: 'Monstera Deliciosa',
        quantity: 1,
        unitPriceCents: 10000,
        lineTotalCents: 10000,
      },
      {
        id: 25,
        productName: 'Macetas de Barro',
        quantity: 2,
        unitPriceCents: 2500,
        lineTotalCents: 5000,
      },
    ],
  }
}

describe('parseCashierSalesResponse', () => {
  it('acepta un payload de ventas V1 completo y correcto', () => {
    const result = parseCashierSalesResponse(validSalesPayload())
    expect(result.schemaVersion).toBe(1)
    expect(result.items[0].folio).toBe('V-001')
    expect(result.page.limit).toBe(25)
    expect(result.page.hasMore).toBe(true)
    expect(result.page.nextCursor).toEqual({
      createdAt: '2026-08-28T09:00:00Z',
      id: SALE_ID,
    })
  })

  it('acepta campos nulos permitidos en la venta y paginación finalizada', () => {
    const payload = validSalesPayload()
    const sale = (payload.items as Record<string, unknown>[])[0]
    sale.createdByLabel = null
    sale.claimExpiresAt = '2026-08-28T09:10:00Z'
    ;(payload.page as Record<string, unknown>).hasMore = false
    ;(payload.page as Record<string, unknown>).nextCursor = null

    const result = parseCashierSalesResponse(payload)
    expect(result.items[0].createdByLabel).toBeNull()
    expect(result.items[0].claimExpiresAt).toBe('2026-08-28T09:10:00Z')
    expect(result.page.hasMore).toBe(false)
    expect(result.page.nextCursor).toBeNull()
  })

  it('rechaza una versión de esquema distinta a V1', () => {
    expect(() => parseCashierSalesResponse({ ...validSalesPayload(), schemaVersion: 2 })).toThrow()
  })

  it('rechaza claimState no permitido', () => {
    const payload = validSalesPayload()
    const sale = (payload.items as Record<string, unknown>[])[0]
    sale.claimState = 'CLAIMED_BY_EVERYONE'
    expect(() => parseCashierSalesResponse(payload)).toThrow()
  })

  it('rechaza límite de página inválido', () => {
    const payload = validSalesPayload()
    ;(payload.page as Record<string, unknown>).limit = 51
    expect(() => parseCashierSalesResponse(payload)).toThrow()
  })

  it('rechaza cursor inconsistente con hasMore', () => {
    const payload = validSalesPayload()
    ;(payload.page as Record<string, unknown>).nextCursor = null
    expect(() => parseCashierSalesResponse(payload)).toThrow()
  })

  it('rechaza venta con ID no UUID', () => {
    const payload = validSalesPayload()
    const sale = (payload.items as Record<string, unknown>[])[0]
    sale.id = 'no-es-uuid'
    expect(() => parseCashierSalesResponse(payload)).toThrow()
  })
})

describe('parseCashierSaleDetailResponse', () => {
  it('acepta un payload de detalle V1 completo y correcto', () => {
    const result = parseCashierSaleDetailResponse(validDetailPayload())
    expect(result.schemaVersion).toBe(1)
    expect(result.sale.id).toBe(SALE_ID)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].productName).toBe('Monstera Deliciosa')
    expect(result.items[1].id).toBe(25)
  })

  it('rechaza una versión de esquema distinta a 1', () => {
    expect(() => parseCashierSaleDetailResponse({ ...validDetailPayload(), schemaVersion: 2 })).toThrow()
  })

  it('rechaza si los ítems de venta no son un arreglo', () => {
    expect(() => parseCashierSaleDetailResponse({ ...validDetailPayload(), items: {} })).toThrow()
  })

  it('rechaza si un ítem de detalle no es un UUID ni entero seguro', () => {
    const payload = validDetailPayload()
    const item = (payload.items as Record<string, unknown>[])[0]
    item.id = 'no-es-uuid-ni-entero'
    expect(() => parseCashierSaleDetailResponse(payload)).toThrow()
  })

  it('rechaza si falta un campo obligatorio en el artículo de detalle', () => {
    const payload = validDetailPayload()
    const item = (payload.items as Record<string, unknown>[])[0]
    delete item.lineTotalCents
    expect(() => parseCashierSaleDetailResponse(payload)).toThrow()
  })
})
