import type { AdminCustomer, UpsertCustomerResponse } from './admin-customers-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const TIMESTAMP_WITH_ZONE_PATTERN = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/

export class AdminCustomersValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminCustomersValidationError'
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminCustomersValidationError(`${field} no es un objeto válido.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], field: string): void {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  if (actual.length !== keys.length || !actual.every((key, index) => key === keys[index])) {
    throw new AdminCustomersValidationError(`${field} no tiene la estructura esperada o contiene campos adicionales.`)
  }
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AdminCustomersValidationError(`${field} no contiene un UUID válido.`)
  }
  return value
}

function timestamp(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !TIMESTAMP_WITH_ZONE_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new AdminCustomersValidationError(`${field} no contiene una fecha con zona horaria válida.`)
  }
  return value
}

export function validateCustomerName(value: unknown): string {
  if (typeof value !== 'string') throw new AdminCustomersValidationError('El nombre debe ser una cadena de texto.')
  const trimmed = value.trim()
  if (trimmed !== value) throw new AdminCustomersValidationError('El nombre no debe contener espacios en los extremos.')
  if (trimmed.length < 2 || trimmed.length > 160) {
    throw new AdminCustomersValidationError('El nombre debe tener entre 2 y 160 caracteres.')
  }
  return trimmed
}

export function validateCustomerEmail(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new AdminCustomersValidationError('El correo debe ser una cadena de texto.')
  const trimmed = value.trim()
  if (trimmed === '') return null
  const lower = trimmed.toLowerCase()
  if (lower.length > 254) throw new AdminCustomersValidationError('El correo electrónico es demasiado largo.')
  if (!EMAIL_PATTERN.test(lower)) throw new AdminCustomersValidationError('El formato del correo electrónico no es válido.')
  return lower
}

export function validateCustomerPhone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new AdminCustomersValidationError('El teléfono debe ser una cadena de texto.')
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length < 8 || trimmed.length > 20) {
    throw new AdminCustomersValidationError('El teléfono debe tener entre 8 y 20 caracteres.')
  }
  return trimmed
}

export function parseCustomer(value: unknown): AdminCustomer {
  const item = record(value, 'cliente')
  exactKeys(item, ['id', 'fullName', 'email', 'phone'], 'cliente')

  return {
    id: uuid(item.id, 'cliente.id'),
    fullName: validateCustomerName(item.fullName),
    email: item.email === null ? null : validateCustomerEmail(item.email),
    phone: item.phone === null ? null : validateCustomerPhone(item.phone),
  }
}

export function parseCustomers(value: unknown): AdminCustomer[] {
  if (!Array.isArray(value)) {
    throw new AdminCustomersValidationError('La respuesta de búsqueda de clientes debe ser una lista.')
  }
  return value.map(parseCustomer)
}

export function parseUpsertCustomerResponse(value: unknown): UpsertCustomerResponse {
  const item = record(value, 'upsert_cliente')
  exactKeys(item, ['id', 'full_name', 'email', 'phone', 'is_active', 'created_at', 'updated_at'], 'upsert_cliente')

  if (typeof item.is_active !== 'boolean') {
    throw new AdminCustomersValidationError('is_active debe ser un booleano.')
  }

  return {
    id: uuid(item.id, 'upsert_cliente.id'),
    fullName: validateCustomerName(item.full_name),
    email: item.email === null ? null : validateCustomerEmail(item.email),
    phone: item.phone === null ? null : validateCustomerPhone(item.phone),
    isActive: item.is_active,
    createdAt: timestamp(item.created_at, 'upsert_cliente.created_at'),
    updatedAt: timestamp(item.updated_at, 'upsert_cliente.updated_at'),
  }
}
