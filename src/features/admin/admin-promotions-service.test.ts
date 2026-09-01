import { describe, expect, it } from 'vitest'
import type { UpsertCatalogPromotionInput } from './admin-promotions-types'

describe('Admin Promotions Contract', () => {
  it('construye los parámetros correctos para una promoción de todo el catálogo', () => {
    const input: UpsertCatalogPromotionInput = {
      id: null,
      name: 'Oferta Primavera',
      description: '25% en todo el vivero',
      scope: 'ALL_PRODUCTS',
      promoType: 'PERCENTAGE',
      value: 25,
      minPurchaseCents: null,
      maxDiscountCents: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
      productIds: [],
    }

    expect(input.scope).toBe('ALL_PRODUCTS')
    expect(input.promoType).toBe('PERCENTAGE')
    expect(input.value).toBe(25)
    expect(input.productIds).toEqual([])
  })

  it('construye los parámetros correctos para una promoción de productos seleccionados', () => {
    const productId = '73000000-0000-0000-0000-000000000001'
    const input: UpsertCatalogPromotionInput = {
      id: '74000000-0000-0000-0000-000000000001',
      name: 'Descuento en Monstera',
      description: null,
      scope: 'SELECTED_PRODUCTS',
      promoType: 'FIXED_AMOUNT',
      value: 5000,
      minPurchaseCents: 10000,
      maxDiscountCents: 5000,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-30T23:59:59.000Z',
      isActive: true,
      productIds: [productId],
    }

    expect(input.scope).toBe('SELECTED_PRODUCTS')
    expect(input.promoType).toBe('FIXED_AMOUNT')
    expect(input.value).toBe(5000)
    expect(input.productIds).toEqual([productId])
    expect(input.minPurchaseCents).toBe(10000)
  })
})
