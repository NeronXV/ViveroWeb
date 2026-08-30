import type { AdminCategory, AdminProduct, ProductUnit } from './admin-catalog-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_WITH_ZONE_PATTERN = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/
const ALLOWED_UNITS = ['pieza', 'maceta', 'charola', 'bolsa', 'kg'] as const

export class AdminCatalogValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminCatalogValidationError'
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminCatalogValidationError(`${field} no es un objeto válido.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], field: string): void {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  if (actual.length !== keys.length || !actual.every((key, index) => key === keys[index])) {
    throw new AdminCatalogValidationError(`${field} no tiene la estructura esperada o contiene campos adicionales.`)
  }
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new AdminCatalogValidationError(`${field} no contiene texto válido.`);
  }
  return value
}

function uuid(value: unknown, field: string): string {
  const result = text(value, field, 36)
  if (!UUID_PATTERN.test(result)) throw new AdminCatalogValidationError(`${field} no contiene un UUID válido.`)
  return result
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field, 64)
  if (!TIMESTAMP_WITH_ZONE_PATTERN.test(result) || Number.isNaN(Date.parse(result))) {
    throw new AdminCatalogValidationError(`${field} no contiene una fecha con zona horaria válida.`)
  }
  return result
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new AdminCatalogValidationError(`${field} no contiene un booleano.`)
  return value
}

function safeInteger(value: unknown, field: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new AdminCatalogValidationError(`${field} no contiene un entero válido.`)
  }
  return value
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AdminCatalogValidationError(`${field} no contiene una cantidad válida.`)
  }
  return value
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null
  return text(value, field, max)
}

export function centsToPesos(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new AdminCatalogValidationError('Los centavos deben ser un entero no negativo.')
  }
  return (cents / 100).toFixed(2)
}

export function pesosToCents(pesos: string | number): number {
  if (typeof pesos === 'number') {
    if (!Number.isFinite(pesos) || pesos < 0) {
      throw new AdminCatalogValidationError('El monto en pesos debe ser un número finito no negativo.')
    }
    const formatted = pesos.toFixed(2)
    const [pesosPart, centsPart] = formatted.split('.')
    return parseInt(pesosPart, 10) * 100 + parseInt(centsPart, 10)
  }

  if (typeof pesos !== 'string') {
    throw new AdminCatalogValidationError('El precio en pesos debe ser un string o un número.')
  }

  const trimmed = pesos.trim()
  const match = /^\d+(?:\.\d{1,2})?$/.exec(trimmed)
  if (!match) {
    throw new AdminCatalogValidationError('El precio debe ser un número decimal no negativo válido con máximo 2 decimales.')
  }

  const [pesosPart, centsPart = '00'] = trimmed.split('.')
  const pesosNum = parseInt(pesosPart, 10)
  const centsNum = parseInt(centsPart.padEnd(2, '0').slice(0, 2), 10)
  return pesosNum * 100 + centsNum
}

export function parseAdminCategory(value: unknown): AdminCategory {
  const item = record(value, 'categoria')
  exactKeys(item, ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at'], 'categoria')
  return {
    id: uuid(item.id, 'categoria.id'),
    name: text(item.name, 'categoria.name', 100),
    description: nullableText(item.description, 'categoria.description', 500),
    isActive: boolean(item.is_active, 'categoria.is_active'),
    createdAt: timestamp(item.created_at, 'categoria.created_at'),
    updatedAt: timestamp(item.updated_at, 'categoria.updated_at'),
  }
}

export function parseAdminCategories(value: unknown): AdminCategory[] {
  if (!Array.isArray(value)) {
    throw new AdminCatalogValidationError('La respuesta de categorías debe ser una lista.')
  }
  return value.map(parseAdminCategory)
}

export function parseAdminProduct(value: unknown): AdminProduct {
  const item = record(value, 'producto')
  
  const hasCategoriesJoin = 'categories' in item
  const expectedKeys = [
    'id', 'internal_code', 'barcode', 'common_name', 'scientific_name', 'description',
    'category_id', 'price_cents', 'wholesale_price_cents', 'unit', 'minimum_stock',
    'watering_advice', 'light_type', 'recommended_climate', 'is_active', 'created_at', 'updated_at'
  ]
  if (hasCategoriesJoin) {
    expectedKeys.push('categories')
  }

  exactKeys(item, expectedKeys, 'producto')

  const unitVal = text(item.unit, 'producto.unit', 20)
  if (!ALLOWED_UNITS.includes(unitVal as typeof ALLOWED_UNITS[number])) {
    throw new AdminCatalogValidationError('El tipo de unidad del producto no es válido.')
  }

  let categoryName: string | undefined
  if (hasCategoriesJoin && item.categories !== null) {
    const catJoin = record(item.categories, 'producto.categories')
    exactKeys(catJoin, ['name'], 'producto.categories')
    categoryName = text(catJoin.name, 'producto.categories.name', 100)
  }

  const wholesalePriceVal = item.wholesale_price_cents === null
    ? null
    : safeInteger(item.wholesale_price_cents, 'producto.wholesale_price_cents')

  return {
    id: uuid(item.id, 'producto.id'),
    internalCode: text(item.internal_code, 'producto.internal_code', 40),
    barcode: nullableText(item.barcode, 'producto.barcode', 128),
    commonName: text(item.common_name, 'producto.common_name', 160),
    scientificName: nullableText(item.scientific_name, 'producto.scientific_name', 160),
    description: typeof item.description === 'string' ? item.description : '',
    categoryId: uuid(item.category_id, 'producto.category_id'),
    priceCents: safeInteger(item.price_cents, 'producto.price_cents'),
    wholesalePriceCents: wholesalePriceVal,
    unit: unitVal as ProductUnit,
    minimumStock: nonNegativeNumber(item.minimum_stock, 'producto.minimum_stock'),
    wateringAdvice: typeof item.watering_advice === 'string' ? item.watering_advice : '',
    lightType: typeof item.light_type === 'string' ? item.light_type : '',
    recommendedClimate: typeof item.recommended_climate === 'string' ? item.recommended_climate : '',
    isActive: boolean(item.is_active, 'producto.is_active'),
    createdAt: timestamp(item.created_at, 'producto.created_at'),
    updatedAt: timestamp(item.updated_at, 'producto.updated_at'),
    categoryName,
  }
}

export function parseAdminProducts(value: unknown): AdminProduct[] {
  if (!Array.isArray(value)) {
    throw new AdminCatalogValidationError('La respuesta de productos debe ser una lista.')
  }
  return value.map(parseAdminProduct)
}
