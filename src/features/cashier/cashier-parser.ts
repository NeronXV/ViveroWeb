import type {
  CashierClaimResponse,
  CashierClaimState,
  CashierConfirmResponse,
  CashierCursor,
  CashierPageInfo,
  CashierPaymentMethod,
  CashierPaymentResultResponse,
  CashierReleaseClaimResponse,
  CashierSale,
  CashierSaleDetailItem,
  CashierSaleDetailResponse,
  CashierSalesResponse,
} from './cashier-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAIM_STATES: CashierClaimState[] = ['AVAILABLE', 'CLAIMED_BY_ME', 'CLAIMED_BY_OTHER']
const PAYMENT_METHODS: CashierPaymentMethod[] = ['CASH', 'CARD', 'TRANSFER']

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

function readPaymentMethod(value: unknown, field: string): CashierPaymentMethod {
  if (typeof value !== 'string' || !PAYMENT_METHODS.includes(value as CashierPaymentMethod)) {
    throw new CashierValidationError(`El campo ${field} tiene un método de pago no válido.`)
  }
  return value as CashierPaymentMethod
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

// Nuevos parsers para la fase de cobro real e idempotencia
export function parseCashierClaimResponse(value: unknown): CashierClaimResponse {
  const expectedKeys = [
    'sale_id',
    'branch_id',
    'cashier_id',
    'claim_token',
    'created_at',
    'expires_at',
    'server_time',
    'renewed',
  ]

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new CashierValidationError('La respuesta de reclamación de venta no tiene el formato esperado.')
  }

  if (typeof value.renewed !== 'boolean') {
    throw new CashierValidationError('El campo renewed de la reclamación debe ser booleano.')
  }

  return {
    sale_id: readUuid(value.sale_id, 'sale_id'),
    branch_id: readUuid(value.branch_id, 'branch_id'),
    cashier_id: readUuid(value.cashier_id, 'cashier_id'),
    claim_token: readUuid(value.claim_token, 'claim_token'),
    created_at: readString(value.created_at, 'created_at'),
    expires_at: readString(value.expires_at, 'expires_at'),
    server_time: readString(value.server_time, 'server_time'),
    renewed: value.renewed,
  }
}

export function parseCashierReleaseClaimResponse(value: unknown): CashierReleaseClaimResponse {
  const expectedKeys = ['sale_id', 'claim_token', 'released_at', 'closed_reason']

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new CashierValidationError('La respuesta de liberación de reclamación no tiene el formato esperado.')
  }

  const closedReason = value.closed_reason
  if (closedReason !== 'EXPIRED' && closedReason !== 'RELEASED') {
    throw new CashierValidationError('El motivo de cierre (closed_reason) no es válido.')
  }

  return {
    sale_id: readUuid(value.sale_id, 'sale_id'),
    claim_token: readUuid(value.claim_token, 'claim_token'),
    released_at: readString(value.released_at, 'released_at'),
    closed_reason: closedReason,
  }
}

export function parseCashierConfirmResponse(value: unknown): CashierConfirmResponse {
  const expectedKeys = ['idempotent_replay', 'sale', 'payment']

  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new CashierValidationError('La respuesta de confirmación de pago no tiene el formato esperado.')
  }

  if (typeof value.idempotent_replay !== 'boolean') {
    throw new CashierValidationError('El campo idempotent_replay debe ser booleano.')
  }

  const sale = value.sale
  const expectedSaleKeys = ['id', 'folio', 'branch_id', 'status', 'total_cents']
  if (!isRecord(sale) || !hasExactKeys(sale, expectedSaleKeys)) {
    throw new CashierValidationError('La sección de venta en confirmación no es válida.')
  }

  const parsedSale = {
    id: readUuid(sale.id, 'sale.id'),
    folio: readString(sale.folio, 'sale.folio'),
    branch_id: readUuid(sale.branch_id, 'sale.branch_id'),
    status: readString(sale.status, 'sale.status'),
    total_cents: readSafeInteger(sale.total_cents, 'sale.total_cents'),
  }

  const payment = value.payment
  const expectedPaymentKeys = [
    'id',
    'sale_id',
    'cashier_id',
    'idempotency_key',
    'method',
    'amount_due_cents',
    'amount_received_cents',
    'change_cents',
    'reference',
    'created_at',
  ]
  if (!isRecord(payment) || !hasExactKeys(payment, expectedPaymentKeys)) {
    throw new CashierValidationError('La sección de pago en confirmación no es válida.')
  }

  const parsedPayment = {
    id: readUuid(payment.id, 'payment.id'),
    sale_id: readUuid(payment.sale_id, 'payment.sale_id'),
    cashier_id: readUuid(payment.cashier_id, 'payment.cashier_id'),
    idempotency_key: readUuid(payment.idempotency_key, 'payment.idempotency_key'),
    method: readPaymentMethod(payment.method, 'payment.method'),
    amount_due_cents: readSafeInteger(payment.amount_due_cents, 'payment.amount_due_cents'),
    amount_received_cents: readSafeInteger(payment.amount_received_cents, 'payment.amount_received_cents'),
    change_cents: readSafeInteger(payment.change_cents, 'payment.change_cents'),
    reference: readNullableString(payment.reference, 'payment.reference'),
    created_at: readString(payment.created_at, 'payment.created_at'),
  }

  return {
    idempotent_replay: value.idempotent_replay,
    sale: parsedSale,
    payment: parsedPayment,
  }
}

export function parseCashierPaymentResultResponse(value: unknown): CashierPaymentResultResponse {
  const expectedKeys = ['schemaVersion', 'status', 'serverTime']
  const optionalKeys = ['sale', 'items', 'branch', 'payment']

  if (!isRecord(value)) {
    throw new CashierValidationError('La respuesta de recuperación no es un objeto válido.')
  }

  // Verificar que contenga al menos las llaves obligatorias
  expectedKeys.forEach((key) => {
    if (!(key in value)) {
      throw new CashierValidationError(`La respuesta de recuperación no contiene el campo obligatorio ${key}.`)
    }
  })

  // Validar que no contenga llaves desconocidas
  const actualKeys = Object.keys(value)
  const allowedKeys = [...expectedKeys, ...optionalKeys]
  actualKeys.forEach((key) => {
    if (!allowedKeys.includes(key)) {
      throw new CashierValidationError(`La respuesta de recuperación contiene una llave desconocida: ${key}.`)
    }
  })

  if (value.schemaVersion !== 1) {
    throw new CashierValidationError('La versión del esquema de recuperación no es compatible.')
  }

  const status = value.status
  if (status !== 'SUCCEEDED' && status !== 'NOT_FOUND') {
    throw new CashierValidationError('El estado de la recuperación debe ser SUCCEEDED o NOT_FOUND.')
  }

  const serverTime = readString(value.serverTime, 'serverTime')

  if (status === 'NOT_FOUND') {
    // Si no se encuentra, no debe tener las propiedades opcionales pobladas
    optionalKeys.forEach((key) => {
      if (key in value && value[key] !== undefined) {
        throw new CashierValidationError(`Una respuesta NOT_FOUND no debe incluir la sección: ${key}.`)
      }
    })

    return {
      schemaVersion: 1,
      status: 'NOT_FOUND',
      serverTime,
    }
  }

  // Parsear campos para SUCCEEDED
  if (!('sale' in value) || !('items' in value) || !('branch' in value) || !('payment' in value)) {
    throw new CashierValidationError('Una respuesta SUCCEEDED debe contener sale, items, branch y payment.')
  }

  const sale = value.sale
  const expectedSaleKeys = ['id', 'folio', 'createdAt', 'totalCents', 'createdByLabel']
  if (!isRecord(sale) || !hasExactKeys(sale, expectedSaleKeys)) {
    throw new CashierValidationError('La sección de venta (sale) en recuperación no es válida.')
  }
  const parsedSale = {
    id: readUuid(sale.id, 'sale.id'),
    folio: readString(sale.folio, 'sale.folio'),
    createdAt: readString(sale.createdAt, 'sale.createdAt'),
    totalCents: readSafeInteger(sale.totalCents, 'sale.totalCents'),
    createdByLabel: readNullableString(sale.createdByLabel, 'sale.createdByLabel'),
  }

  if (!Array.isArray(value.items)) {
    throw new CashierValidationError('Los artículos (items) en recuperación deben ser un arreglo.')
  }
  const items = value.items.map((item, index) => readDetailItem(item, index))

  const branch = value.branch
  if (!isRecord(branch) || !hasExactKeys(branch, ['name'])) {
    throw new CashierValidationError('La sección de sucursal (branch) en recuperación no es válida.')
  }
  const parsedBranch = {
    name: readString(branch.name, 'branch.name'),
  }

  const payment = value.payment
  const expectedPaymentKeys = ['method', 'amountReceivedCents', 'changeCents', 'reference', 'createdAt']
  if (!isRecord(payment) || !hasExactKeys(payment, expectedPaymentKeys)) {
    throw new CashierValidationError('La sección de pago (payment) en recuperación no es válida.')
  }

  const parsedPayment = {
    method: readPaymentMethod(payment.method, 'payment.method'),
    amountReceivedCents: payment.amountReceivedCents === null ? null : readSafeInteger(payment.amountReceivedCents, 'payment.amountReceivedCents'),
    changeCents: payment.changeCents === null ? null : readSafeInteger(payment.changeCents, 'payment.changeCents'),
    reference: readNullableString(payment.reference, 'payment.reference'),
    createdAt: readString(payment.createdAt, 'payment.createdAt'),
  }

  return {
    schemaVersion: 1,
    status: 'SUCCEEDED',
    sale: parsedSale,
    items,
    branch: parsedBranch,
    payment: parsedPayment,
    serverTime,
  }
}
