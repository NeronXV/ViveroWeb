import type {
  PublicCatalogCategory,
  PublicCatalogCursor,
  PublicCatalogImage,
  PublicCatalogProduct,
  PublicCatalogResponse,
} from './catalog-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const PUBLIC_CATALOG_IMAGE_BUCKET = 'catalog-images'

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
  })
}

export function isValidCatalogStoragePath(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) return false
  if (containsControlCharacter(value) || value.startsWith('/') || value.startsWith(`${PUBLIC_CATALOG_IMAGE_BUCKET}/`)) return false
  if (value.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return false
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) return false
  return /\.(?:jpe?g|png|webp|avif)$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function readString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new PublicCatalogValidationError(`El campo ${field} no es válido.`)
  }
  return value
}

function readNullableString(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field, true)
}

function readUuid(value: unknown, field: string): string {
  const uuid = readString(value, field)
  if (!UUID_PATTERN.test(uuid)) throw new PublicCatalogValidationError(`El campo ${field} no es un UUID válido.`)
  return uuid
}

function readCategory(value: unknown, field: string): PublicCatalogCategory {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'name'])) {
    throw new PublicCatalogValidationError(`El campo ${field} no tiene el formato esperado.`)
  }
  return { id: readUuid(value.id, `${field}.id`), name: readString(value.name, `${field}.name`) }
}

function readImage(value: unknown): PublicCatalogImage | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['bucketName', 'storagePath', 'altText'])) {
    throw new PublicCatalogValidationError('La imagen no tiene el formato esperado.')
  }
  if (value.bucketName !== PUBLIC_CATALOG_IMAGE_BUCKET) {
    throw new PublicCatalogValidationError('El bucket de la imagen no es compatible.')
  }
  if (!isValidCatalogStoragePath(value.storagePath)) {
    throw new PublicCatalogValidationError('La ruta de la imagen no es válida.')
  }
  return {
    bucketName: PUBLIC_CATALOG_IMAGE_BUCKET,
    storagePath: value.storagePath,
    altText: readNullableString(value.altText, 'image.altText'),
  }
}

function readProduct(value: unknown, index: number): PublicCatalogProduct {
  const field = `items[${index}]`
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'name', 'scientificName', 'description', 'category', 'price', 'care',
    'image', 'publicationStatus',
  ])) {
    throw new PublicCatalogValidationError(`El elemento ${field} no tiene el formato esperado.`)
  }
  if (!isRecord(value.price) || !hasExactKeys(value.price, ['amountCents', 'currency', 'unit'])) {
    throw new PublicCatalogValidationError(`El precio de ${field} no tiene el formato esperado.`)
  }
  if (!Number.isSafeInteger(value.price.amountCents) || (value.price.amountCents as number) < 0) {
    throw new PublicCatalogValidationError(`El importe de ${field} no está expresado en centavos enteros.`)
  }
  if (value.price.currency !== 'MXN') {
    throw new PublicCatalogValidationError(`La moneda de ${field} no es compatible.`)
  }
  if (!isRecord(value.care) || !hasExactKeys(value.care, ['wateringAdvice', 'lightType', 'recommendedClimate'])) {
    throw new PublicCatalogValidationError(`Los cuidados de ${field} no tienen el formato esperado.`)
  }
  if (value.publicationStatus !== 'LISTED') {
    throw new PublicCatalogValidationError(`El estado de publicación de ${field} no es compatible.`)
  }
  return {
    id: readUuid(value.id, `${field}.id`),
    name: readString(value.name, `${field}.name`),
    scientificName: readNullableString(value.scientificName, `${field}.scientificName`),
    description: readString(value.description, `${field}.description`, true),
    category: readCategory(value.category, `${field}.category`),
    price: {
      amountCents: value.price.amountCents as number,
      currency: 'MXN',
      unit: readString(value.price.unit, `${field}.price.unit`),
    },
    care: {
      wateringAdvice: readString(value.care.wateringAdvice, `${field}.care.wateringAdvice`, true),
      lightType: readString(value.care.lightType, `${field}.care.lightType`, true),
      recommendedClimate: readString(value.care.recommendedClimate, `${field}.care.recommendedClimate`, true),
    },
    image: readImage(value.image),
    publicationStatus: 'LISTED',
  }
}

function readCursor(value: unknown): PublicCatalogCursor | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['sortName', 'id'])) {
    throw new PublicCatalogValidationError('El cursor no tiene el formato esperado.')
  }
  const sortName = readString(value.sortName, 'page.nextCursor.sortName')
  if (sortName.trim() === '' || sortName.length > 160) {
    throw new PublicCatalogValidationError('El nombre del cursor no es válido.')
  }
  return { sortName, id: readUuid(value.id, 'page.nextCursor.id') }
}

export class PublicCatalogValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicCatalogValidationError'
  }
}

export function parsePublicCatalogResponse(value: unknown): PublicCatalogResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'items', 'categories', 'page'])) {
    throw new PublicCatalogValidationError('El catálogo no tiene el formato esperado.')
  }
  if (value.schemaVersion !== 2) {
    throw new PublicCatalogValidationError('La versión del catálogo no es compatible.')
  }
  if (!Array.isArray(value.items) || !Array.isArray(value.categories)) {
    throw new PublicCatalogValidationError('Las colecciones del catálogo no son válidas.')
  }
  if (!isRecord(value.page) || !hasExactKeys(value.page, ['limit', 'hasMore', 'nextCursor'])) {
    throw new PublicCatalogValidationError('La página del catálogo no tiene el formato esperado.')
  }
  if (!Number.isInteger(value.page.limit) || (value.page.limit as number) < 1 || (value.page.limit as number) > 50) {
    throw new PublicCatalogValidationError('El límite de la página no es válido.')
  }
  if (typeof value.page.hasMore !== 'boolean') {
    throw new PublicCatalogValidationError('El indicador de paginación no es válido.')
  }
  const nextCursor = readCursor(value.page.nextCursor)
  if (value.page.hasMore !== (nextCursor !== null)) {
    throw new PublicCatalogValidationError('El cursor no coincide con el estado de paginación.')
  }
  const items = value.items.map(readProduct)
  const categories = value.categories.map((category, index) => readCategory(category, `categories[${index}]`))
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new PublicCatalogValidationError('La página contiene productos duplicados.')
  }
  if (new Set(categories.map(({ id }) => id)).size !== categories.length) {
    throw new PublicCatalogValidationError('La respuesta contiene categorías duplicadas.')
  }
  return {
    schemaVersion: 2,
    items,
    categories,
    page: { limit: value.page.limit as number, hasMore: value.page.hasMore, nextCursor },
  }
}
