import { describe, expect, it } from 'vitest'
import {
  centsToPesos,
  pesosToCents,
  parseAdminCategory,
  parseAdminProduct,
  AdminCatalogValidationError,
} from './admin-catalog-parser'

const CATEGORY_ID = 'ca000000-0000-0000-0000-000000000001'
const PRODUCT_ID = 'ad000000-0000-0000-0000-000000000001'

describe('conversión pesos/centavos', () => {
  it('convierte pesos (número o string) a centavos correctamente', () => {
    expect(pesosToCents(10.5)).toBe(1050)
    expect(pesosToCents('10.50')).toBe(1050)
    expect(pesosToCents(0.05)).toBe(5)
    expect(pesosToCents('0.05')).toBe(5)
    expect(pesosToCents(0)).toBe(0)
    expect(pesosToCents('0')).toBe(0)
    expect(pesosToCents(100)).toBe(10000)
    expect(pesosToCents('100')).toBe(10000)
  })

  it('rechaza montos inválidos o con más de dos decimales', () => {
    expect(() => pesosToCents(-1)).toThrow(AdminCatalogValidationError)
    expect(() => pesosToCents('10.555')).toThrow(AdminCatalogValidationError)
    expect(() => pesosToCents('not-a-number')).toThrow(AdminCatalogValidationError)
    expect(() => pesosToCents(NaN)).toThrow(AdminCatalogValidationError)
  })

  it('convierte centavos a pesos string correctamente', () => {
    expect(centsToPesos(1050)).toBe('10.50')
    expect(centsToPesos(5)).toBe('0.05')
    expect(centsToPesos(0)).toBe('0.00')
    expect(centsToPesos(10000)).toBe('100.00')
  })

  it('rechaza centavos no enteros o negativos', () => {
    expect(() => centsToPesos(-5)).toThrow(AdminCatalogValidationError)
    expect(() => centsToPesos(1.5)).toThrow(AdminCatalogValidationError)
  })
})

describe('parseAdminCategory', () => {
  const validCategory = {
    id: CATEGORY_ID,
    name: 'Interior',
    description: 'Plantas de sombra',
    is_active: true,
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  }

  it('acepta una categoría válida de base de datos', () => {
    const result = parseAdminCategory(validCategory)
    expect(result).toEqual({
      id: CATEGORY_ID,
      name: 'Interior',
      description: 'Plantas de sombra',
      isActive: true,
      createdAt: '2026-08-29T10:00:00Z',
      updatedAt: '2026-08-29T10:00:00Z',
    })
  })

  it('rechaza si contiene campos adicionales', () => {
    expect(() => parseAdminCategory({
      ...validCategory,
      extra_field: 'unknown',
    })).toThrow(AdminCatalogValidationError)
  })

  it('rechaza si falta algún campo obligatorio', () => {
    const incomplete: Partial<typeof validCategory> = { ...validCategory }
    delete incomplete.name
    expect(() => parseAdminCategory(incomplete)).toThrow(AdminCatalogValidationError)
  })

  it('rechaza tipos de datos incorrectos', () => {
    expect(() => parseAdminCategory({ ...validCategory, is_active: 'si' })).toThrow(AdminCatalogValidationError)
    expect(() => parseAdminCategory({ ...validCategory, name: '   ' })).toThrow(AdminCatalogValidationError)
  })
})

describe('parseAdminProduct', () => {
  const validProduct = {
    id: PRODUCT_ID,
    internal_code: 'INT-MON-01',
    barcode: '7501234567890',
    common_name: 'Monstera deliciosa',
    scientific_name: 'Monstera deliciosa',
    description: 'Planta de hojas grandes.',
    category_id: CATEGORY_ID,
    price_cents: 25000,
    wholesale_price_cents: 20000,
    unit: 'pieza',
    minimum_stock: 5,
    watering_advice: 'Riego cuando el sustrato esté seco.',
    light_type: 'Luz indirecta brillante',
    recommended_climate: 'Templado a cálido',
    is_active: true,
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  }

  it('acepta un producto válido sin unión de categoría', () => {
    const result = parseAdminProduct(validProduct)
    expect(result.commonName).toBe('Monstera deliciosa')
    expect(result.priceCents).toBe(25000)
    expect(result.categoryName).toBeUndefined()
  })

  it('acepta un producto con unión de categoría', () => {
    const result = parseAdminProduct({
      ...validProduct,
      categories: { name: 'Interior' },
    })
    expect(result.categoryName).toBe('Interior')
  })

  it('rechaza si contiene campos adicionales', () => {
    expect(() => parseAdminProduct({
      ...validProduct,
      extra_field: 'unknown',
    })).toThrow(AdminCatalogValidationError)
  })

  it('rechaza tipos de unidad inválidos', () => {
    expect(() => parseAdminProduct({
      ...validProduct,
      unit: 'litros',
    })).toThrow(AdminCatalogValidationError)
  })

  it('rechaza si los precios no son enteros no negativos', () => {
    expect(() => parseAdminProduct({
      ...validProduct,
      price_cents: -100,
    })).toThrow(AdminCatalogValidationError)

    expect(() => parseAdminProduct({
      ...validProduct,
      price_cents: 15.5,
    })).toThrow(AdminCatalogValidationError)
  })
})
