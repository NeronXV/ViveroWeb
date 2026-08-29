import type {
  CashierClaimState,
  CashierCursor,
  CashierPageInfo,
  CashierSale,
  CashierSaleDetailItem,
  CashierSaleDetailResponse,
  CashierSalesResponse,
} from './cashier-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAIM_STATES: CashierClaimState[] = ['AVAILABLE', 'CLAIMED_BY_ME', 'CLAIMED_BY_OTHER']

export class CashierValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CashierValidationError'
  }
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
    throw new CashierValidationError(`El campo ${field} no es válido.`)
  }
  return value
}

function readNullableString(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field, true)
}

function readUuid(value: unknown, field: string): string {
  const uuid = readString(value, field)
  if (!UUID_PATTERN.test(uuid)) {
    throw new CashierValidationError(`El campo ${field} no es un UUID válido.`)
  }
  return uuid
}

function readSafeInteger(value: unknown, field: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new CashierValidationError(`El campo ${field} debe ser un entero válido mayor o igual a ${min}.`)
  }
  return value
}

function readClaimState(value: unknown, field: string): CashierClaimState {
  if (typeof value !== 'string' || !CLAIM_STATES.includes(value as CashierClaimState)) {
    throw new CashierValidationError(`El campo ${field} tiene un estado de reclamación no válido.`)
  }
  return value as CashierClaimState
}

function readSale(value: unknown, indexOrLabel: number | string): CashierSale {
  const label = typeof indexOrLabel === 'number' ? `items[${indexOrLabel}]` : indexOrLabel
  const expectedKeys = [
    'id',
    'folio',
    'createdAt',
    'totalCents',
    'itemCount',
    'status',
    'createdByLabel',
    'claimState',
    'claimExpiresAt',
    'serverTime',
  ]

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new CashierValidationError(`La venta ${label} no tiene la estructura esperada.`)
  }

  return {
    id: readUuid(value.id, `${label}.id`),
    folio: readString(value.folio, `${label}.folio`),
    createdAt: readString(value.createdAt, `${label}.createdAt`),
    totalCents: readSafeInteger(value.totalCents, `${label}.totalCents`),
    itemCount: readSafeInteger(value.itemCount, `${label}.itemCount`),
    status: readString(value.status, `${label}.status`),
    createdByLabel: readNullableString(value.createdByLabel, `${label}.createdByLabel`),
    claimState: readClaimState(value.claimState, `${label}.claimState`),
    claimExpiresAt: readNullableString(value.claimExpiresAt, `${label}.claimExpiresAt`),
    serverTime: readString(value.serverTime, `${label}.serverTime`),
  }
}

function readCursor(value: unknown, field: string): CashierCursor | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['createdAt', 'id'])) {
    throw new CashierValidationError(`El cursor ${field} no tiene la estructura esperada.`)
  }
  return {
    createdAt: readString(value.createdAt, `${field}.createdAt`),
    id: readUuid(value.id, `${field}.id`),
  }
}

function readPageInfo(value: unknown, field: string): CashierPageInfo {
  if (!isRecord(value) || !hasExactKeys(value, ['limit', 'hasMore', 'nextCursor'])) {
    throw new CashierValidationError(`La página ${field} no tiene la estructura esperada.`)
  }

  const limit = readSafeInteger(value.limit, `${field}.limit`, 1)
  if (limit > 50) {
    throw new CashierValidationError(`El límite de página ${field}.limit excede el máximo permitido (50).`)
  }

  const hasMore = value.hasMore
  if (typeof hasMore !== 'boolean') {
    throw new CashierValidationError(`El indicador ${field}.hasMore debe ser booleano.`)
  }

  const nextCursor = readCursor(value.nextCursor, `${field}.nextCursor`)

  if (hasMore !== (nextCursor !== null)) {
    throw new CashierValidationError(`El cursor y el indicador de paginación de ${field} son inconsistentes.`)
  }

  return {
    limit,
    hasMore,
    nextCursor,
  }
}

export function parseCashierSalesResponse(value: unknown): CashierSalesResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'items', 'page'])) {
    throw new CashierValidationError('La respuesta de ventas de caja no tiene la estructura esperada.')
  }

  if (value.schemaVersion !== 1) {
    throw new CashierValidationError('La versión del esquema de la respuesta no es compatible.')
  }

  if (!Array.isArray(value.items)) {
    throw new CashierValidationError('La colección de ventas no es válida.')
  }

  const items = value.items.map((item, index) => readSale(item, index))
  const page = readPageInfo(value.page, 'page')

  return {
    schemaVersion: 1,
    items,
    page,
  }
}

function readDetailItem(value: unknown, index: number): CashierSaleDetailItem {
  const label = `items[${index}]`
  const expectedKeys = ['id', 'productName', 'quantity', 'unitPriceCents', 'lineTotalCents']

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new CashierValidationError(`El artículo ${label} no tiene la estructura esperada.`)
  }

  const id = value.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new CashierValidationError(`El id del artículo ${label} debe ser UUID o número.`)
  }
  const parsedId = typeof id === 'string' ? readUuid(id, `${label}.id`) : readSafeInteger(id, `${label}.id`, 1)

  return {
    id: parsedId,
    productName: readString(value.productName, `${label}.productName`),
    quantity: readSafeInteger(value.quantity, `${label}.quantity`, 1),
    unitPriceCents: readSafeInteger(value.unitPriceCents, `${label}.unitPriceCents`),
    lineTotalCents: readSafeInteger(value.lineTotalCents, `${label}.lineTotalCents`),
  }
}

export function parseCashierSaleDetailResponse(value: unknown): CashierSaleDetailResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'sale', 'items'])) {
    throw new CashierValidationError('El detalle de la venta no tiene la estructura esperada.')
  }

  if (value.schemaVersion !== 1) {
    throw new CashierValidationError('La versión del esquema de detalle no es compatible.')
  }

  const sale = readSale(value.sale, 'sale')

  if (!Array.isArray(value.items)) {
    throw new CashierValidationError('Los artículos de la venta no tienen un formato válido.')
  }

  const items = value.items.map((item, index) => readDetailItem(item, index))

  return {
    schemaVersion: 1,
    sale,
    items,
  }
}
