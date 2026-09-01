import { describe, expect, it } from 'vitest'
import { parsePublicCatalogResponse } from './catalog-parser'

const PRODUCT_ID = '73000000-0000-0000-0000-000000000001'
const CATEGORY_ID = '72000000-0000-0000-0000-000000000001'

function validPayload(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    items: [{
      id: PRODUCT_ID,
      name: 'Aloe público',
      scientificName: 'Aloe vera',
      description: 'Planta resistente',
      category: { id: CATEGORY_ID, name: 'Suculentas' },
      price: {
        amountCents: 12500,
        originalAmountCents: 15000,
        discountPercent: 17,
        currency: 'MXN',
        unit: 'maceta',
      },
      care: { wateringAdvice: 'Semanal', lightType: 'Sol', recommendedClimate: 'Seco' },
      image: {
        bucketName: 'catalog-images',
        storagePath: 'products/aloe/main.webp',
        altText: 'Aloe en maceta',
      },
      activePromotion: {
        id: '74000000-0000-0000-0000-000000000001',
        name: 'Oferta Primavera',
      },
      publicationStatus: 'LISTED',
    }],
    categories: [{ id: CATEGORY_ID, name: 'Suculentas' }],
    page: {
      limit: 24,
      hasMore: true,
      nextCursor: { sortName: 'aloe público', id: PRODUCT_ID },
    },
  }
}

function firstItem(payload: Record<string, unknown>): Record<string, unknown> {
  return (payload.items as Record<string, unknown>[])[0]
}

describe('parsePublicCatalogResponse', () => {
  it('acepta un payload V3 completo con promoción activa', () => {
    const result = parsePublicCatalogResponse(validPayload())
    expect(result.schemaVersion).toBe(3)
    expect(result.items[0].image).toEqual({
      bucketName: 'catalog-images',
      storagePath: 'products/aloe/main.webp',
      altText: 'Aloe en maceta',
    })
    expect(result.items[0].price.originalAmountCents).toBe(15000)
    expect(result.items[0].price.discountPercent).toBe(17)
    expect(result.items[0].activePromotion).toEqual({
      id: '74000000-0000-0000-0000-000000000001',
      name: 'Oferta Primavera',
    })
  })

  it('acepta los NULL permitidos y una imagen/promoción ausente', () => {
    const payload = validPayload()
    const item = firstItem(payload)
    item.scientificName = null
    item.image = null
    item.activePromotion = null
    ;(item.price as Record<string, unknown>).originalAmountCents = null
    ;(item.price as Record<string, unknown>).discountPercent = null
    ;(payload.page as Record<string, unknown>).hasMore = false
    ;(payload.page as Record<string, unknown>).nextCursor = null
    const result = parsePublicCatalogResponse(payload)
    expect(result.items[0].scientificName).toBeNull()
    expect(result.items[0].image).toBeNull()
    expect(result.items[0].activePromotion).toBeNull()
    expect(result.items[0].price.originalAmountCents).toBeNull()
    expect(result.items[0].price.discountPercent).toBeNull()
  })

  it('acepta cada extensión de imagen autorizada sin distinguir mayúsculas', () => {
    for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'avif', 'JPEG']) {
      const payload = validPayload()
      ;(firstItem(payload).image as Record<string, unknown>).storagePath = `products/example.${extension}`
      expect(() => parsePublicCatalogResponse(payload)).not.toThrow()
    }
  })

  it('rechaza schemaVersion V1', () => {
    expect(() => parsePublicCatalogResponse({ ...validPayload(), schemaVersion: 1 })).toThrow()
  })

  it.each([
    ['bucket faltante', { storagePath: 'products/a.jpg', altText: null }],
    ['bucket diferente', { bucketName: 'avatars', storagePath: 'products/a.jpg', altText: null }],
  ])('rechaza %s', (_label, image) => {
    const payload = validPayload()
    firstItem(payload).image = image
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it.each([
    ['URL absoluta', 'https://example.invalid/image.jpg'],
    ['esquema no HTTP', 'data:image/png;base64,AAAA.png'],
    ['traversal padre', '../image.jpg'],
    ['segmento actual', 'products/./image.jpg'],
    ['barra inicial', '/products/image.jpg'],
    ['barra invertida', 'products\\image.jpg'],
    ['control', 'products/image\n.jpg'],
    ['extensión no permitida', 'products/image.svg'],
    ['espacio inicial', ' products/image.jpg'],
    ['espacio final', 'products/image.jpg '],
    ['prefijo de bucket', 'catalog-images/products/image.jpg'],
    ['ruta vacía', ''],
  ])('rechaza storagePath con %s', (_label, storagePath) => {
    const payload = validPayload()
    ;(firstItem(payload).image as Record<string, unknown>).storagePath = storagePath
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it('rechaza campos adicionales', () => {
    const payload = validPayload()
    firstItem(payload).stock = 3
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it.each([
    ['negativos', -1],
    ['fraccionarios', 12.5],
    ['no seguros', Number.MAX_SAFE_INTEGER + 1],
  ])('rechaza centavos %s', (_label, amountCents) => {
    const payload = validPayload()
    ;(firstItem(payload).price as Record<string, unknown>).amountCents = amountCents
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it.each([
    ['moneda', 'USD', 'LISTED'],
    ['estado de publicación', 'MXN', 'DRAFT'],
  ])('rechaza %s inválido', (_label, currency, publicationStatus) => {
    const payload = validPayload()
    ;(firstItem(payload).price as Record<string, unknown>).currency = currency
    firstItem(payload).publicationStatus = publicationStatus
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it('rechaza una categoría inválida', () => {
    const payload = validPayload()
    firstItem(payload).category = { id: 'no-es-uuid', name: 'Suculentas' }
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it('rechaza un cursor incoherente con hasMore', () => {
    const payload = validPayload()
    ;(payload.page as Record<string, unknown>).nextCursor = null
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })

  it.each([
    ['items con tipo incorrecto', (payload: Record<string, unknown>) => { payload.items = {} }],
    ['precio con tipo incorrecto', (payload: Record<string, unknown>) => { firstItem(payload).price = '125.00' }],
    ['campo obligatorio ausente', (payload: Record<string, unknown>) => { delete firstItem(payload).description }],
  ])('rechaza %s', (_label, mutate) => {
    const payload = validPayload()
    mutate(payload)
    expect(() => parsePublicCatalogResponse(payload)).toThrow()
  })
})
