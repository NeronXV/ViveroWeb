import type {
  CashierPaymentAttempt,
  CashierPaymentMethod,
  CashierPaymentResultResponse,
  CashierPaymentStatus,
} from './cashier-types'
import { parseCashierPaymentResultResponse } from './cashier-parser'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_STATUSES: readonly CashierPaymentStatus[] = [
  'CLAIMING',
  'CLAIMED',
  'CONFIRMING',
  'UNCERTAIN',
  'SUCCEEDED',
  'EXPIRED',
  'UNAVAILABLE',
]
const PAYMENT_METHODS: readonly CashierPaymentMethod[] = ['CASH', 'CARD', 'TRANSFER']
const STORAGE_PREFIX = 'viveroweb_cashier_payment_attempt_v2'

export class CashierPaymentStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CashierPaymentStateError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

export function createPaymentAttempt(
  userId: string,
  saleId: string,
  idempotencyKey: string,
): CashierPaymentAttempt {
  if (!isUuid(userId) || !isUuid(saleId) || !isUuid(idempotencyKey)) {
    throw new CashierPaymentStateError('No se puede crear un intento con identificadores inválidos.')
  }

  return {
    version: 2,
    userId,
    saleId,
    idempotencyKey,
    status: 'CLAIMING',
    claimToken: null,
    claimExpiresAt: null,
    method: null,
    amountReceivedCents: null,
    reference: null,
    errorMsg: null,
    paymentResult: null,
  }
}

export function parseStoredPaymentAttempt(
  raw: string,
  expectedUserId: string,
  expectedSaleId: string,
): CashierPaymentAttempt {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new CashierPaymentStateError('El intento persistido no contiene JSON válido.')
  }

  if (!isRecord(value)) throw new CashierPaymentStateError('El intento persistido no es un objeto.')
  const expectedKeys = [
    'version', 'userId', 'saleId', 'idempotencyKey', 'status', 'claimToken',
    'claimExpiresAt', 'method', 'amountReceivedCents', 'reference', 'errorMsg', 'paymentResult',
  ]
  const actualKeys = Object.keys(value).sort()
  if (actualKeys.length !== expectedKeys.length || !actualKeys.every((key, index) => key === [...expectedKeys].sort()[index])) {
    throw new CashierPaymentStateError('El intento persistido no tiene la estructura esperada.')
  }
  if (value.version !== 2 || value.userId !== expectedUserId || value.saleId !== expectedSaleId) {
    throw new CashierPaymentStateError('El intento persistido no corresponde a esta versión, usuario o venta.')
  }
  if (!isUuid(value.userId) || !isUuid(value.saleId) || !isUuid(value.idempotencyKey)) {
    throw new CashierPaymentStateError('El intento persistido contiene identificadores inválidos.')
  }
  if (typeof value.status !== 'string' || !PAYMENT_STATUSES.includes(value.status as CashierPaymentStatus)) {
    throw new CashierPaymentStateError('El intento persistido contiene un estado inválido.')
  }
  if (value.claimToken !== null && !isUuid(value.claimToken)) {
    throw new CashierPaymentStateError('El intento persistido contiene un claim inválido.')
  }
  if (!isNullableString(value.claimExpiresAt) || !isNullableString(value.reference) || !isNullableString(value.errorMsg)) {
    throw new CashierPaymentStateError('El intento persistido contiene texto inválido.')
  }
  if (value.claimExpiresAt !== null && Number.isNaN(Date.parse(value.claimExpiresAt))) {
    throw new CashierPaymentStateError('El intento persistido contiene una expiración inválida.')
  }
  if (typeof value.reference === 'string' && (
    value.reference.length > 120
    || [...value.reference].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  )) {
    throw new CashierPaymentStateError('El intento persistido contiene una referencia inválida.')
  }
  if (value.method !== null && (typeof value.method !== 'string' || !PAYMENT_METHODS.includes(value.method as CashierPaymentMethod))) {
    throw new CashierPaymentStateError('El intento persistido contiene un método inválido.')
  }
  if (!isNullableSafeInteger(value.amountReceivedCents)) {
    throw new CashierPaymentStateError('El intento persistido contiene un importe inválido.')
  }
  const paymentResult = value.paymentResult === null
    ? null
    : parseCashierPaymentResultResponse(value.paymentResult)
  if (paymentResult !== null && paymentResult.status !== 'SUCCEEDED') {
    throw new CashierPaymentStateError('El intento persistido no contiene un resultado terminal exitoso.')
  }
  if (value.status === 'SUCCEEDED' && value.paymentResult === null) {
    throw new CashierPaymentStateError('Un intento exitoso debe conservar el resultado canónico.')
  }
  if (value.status !== 'SUCCEEDED' && value.paymentResult !== null) {
    throw new CashierPaymentStateError('Solo un intento exitoso puede conservar un resultado.')
  }
  if (paymentResult?.sale?.id !== undefined && paymentResult.sale.id !== expectedSaleId) {
    throw new CashierPaymentStateError('El resultado persistido pertenece a otra venta.')
  }
  if (['CLAIMED', 'CONFIRMING', 'UNCERTAIN'].includes(value.status as string) && value.claimToken === null) {
    throw new CashierPaymentStateError('El estado persistido requiere un claim.')
  }
  if (value.method === null && (value.amountReceivedCents !== null || value.reference !== null)) {
    throw new CashierPaymentStateError('Un intento sin método no puede contener datos de pago.')
  }
  if (value.method === 'CASH' && value.reference !== null) {
    throw new CashierPaymentStateError('Un intento CASH no puede contener referencia.')
  }
  if (value.method !== null && value.method !== 'CASH' && value.amountReceivedCents !== null) {
    throw new CashierPaymentStateError('Un intento no efectivo no puede contener efectivo recibido.')
  }

  return { ...value, paymentResult } as unknown as CashierPaymentAttempt
}

export function getPaymentAttemptStorageKey(userId: string, saleId: string): string {
  return `${STORAGE_PREFIX}:${userId}:${saleId}`
}

export function loadPaymentAttempt(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId: string,
  saleId: string,
): CashierPaymentAttempt | null {
  const key = getPaymentAttemptStorageKey(userId, saleId)
  const raw = storage.getItem(key)
  if (!raw) return null
  try {
    return parseStoredPaymentAttempt(raw, userId, saleId)
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function savePaymentAttempt(storage: Pick<Storage, 'setItem'>, attempt: CashierPaymentAttempt): void {
  storage.setItem(getPaymentAttemptStorageKey(attempt.userId, attempt.saleId), JSON.stringify(attempt))
}

export function removePaymentAttempt(
  storage: Pick<Storage, 'removeItem'>,
  userId: string,
  saleId: string,
): void {
  storage.removeItem(getPaymentAttemptStorageKey(userId, saleId))
}

export function restoreInterruptedAttempt(attempt: CashierPaymentAttempt): CashierPaymentAttempt {
  return attempt.status === 'CONFIRMING'
    ? {
        ...attempt,
        status: 'UNCERTAIN',
        errorMsg: 'La confirmación fue interrumpida. Concilia el resultado antes de continuar.',
      }
    : attempt
}

export function isNavigationLocked(status: CashierPaymentStatus): boolean {
  return status === 'CONFIRMING' || status === 'UNCERTAIN'
}

export function attachSucceededResult(
  attempt: CashierPaymentAttempt,
  result: CashierPaymentResultResponse,
): CashierPaymentAttempt {
  if (result.status !== 'SUCCEEDED') {
    throw new CashierPaymentStateError('Solo un resultado canónico exitoso puede cerrar el intento.')
  }
  if (result.sale?.id !== attempt.saleId) {
    throw new CashierPaymentStateError('El resultado canónico pertenece a otra venta.')
  }
  return { ...attempt, status: 'SUCCEEDED', errorMsg: null, paymentResult: result }
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T | undefined>,
  ): Promise<T | undefined>
}

export async function withPaymentAttemptLock<T>(
  userId: string,
  saleId: string,
  callback: () => Promise<T>,
  lockManager?: LockManagerLike,
): Promise<T> {
  const manager = lockManager ?? (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { locks?: LockManagerLike }).locks
    : undefined)
  if (!manager) {
    throw new CashierPaymentStateError('Este navegador no permite bloquear cobros entre pestañas de forma segura.')
  }

  let acquired = false
  let result: T | undefined
  await manager.request(
    `viveroweb-cashier-payment:${userId}:${saleId}`,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) return undefined
      acquired = true
      result = await callback()
      return result
    },
  )
  if (!acquired) throw new CashierPaymentStateError('Este cobro está siendo procesado en otra pestaña.')
  return result as T
}
