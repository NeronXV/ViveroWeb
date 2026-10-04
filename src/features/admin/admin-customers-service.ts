import { backendId } from '../auth/backend-runtime'
import { backendHttp, BackendHttpError, apiId, list, object } from '../../lib/backend-http'
import { AdminServiceError } from './admin-service'
import { parseCustomers, parseUpsertCustomerResponse, validateCustomerName, validateCustomerEmail, validateCustomerPhone } from './admin-customers-parser'
import type { AdminCustomer, UpsertCustomerInput, UpsertCustomerResponse } from './admin-customers-types'

async function customersRequest<T>(action: () => Promise<T>, isSearch: boolean, signal?: AbortSignal): Promise<T> {
  try { return await action() } catch (error) {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (error instanceof AdminServiceError) throw error
    if (error instanceof BackendHttpError) {
      if (error.status === 403) throw new AdminServiceError(isSearch ? 'Acceso denegado. No tienes permisos para buscar clientes.' : 'Acceso denegado. No tienes permisos para administrar clientes.', isSearch ? 'UNAUTHORIZED_SEARCH' : 'UNAUTHORIZED_MANAGEMENT')
      throw new AdminServiceError('No fue posible completar la operación de clientes en el servidor.', error.code)
    }
    throw new AdminServiceError('No fue posible realizar la operación de clientes.', 'INCOMPATIBLE_RESPONSE')
  }
}
export function searchCustomers(query: string, limit = 50, signal?: AbortSignal): Promise<AdminCustomer[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return Promise.resolve([])
  if (trimmed.length > 80 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new AdminServiceError('La consulta de búsqueda no es válida.', 'INVALID_QUERY')
  return customersRequest(async () => {
    const data = await backendHttp('customers?' + new URLSearchParams({ search: trimmed, limit: String(limit) }), 'GET', undefined, signal)
    if (data.schema_version !== 1) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    return parseCustomers(list(data.items).map(row => ({ id: apiId(row.id), fullName: row.full_name, email: row.email, phone: row.phone })))
  }, true, signal)
}
export function upsertCustomer(input: UpsertCustomerInput, signal?: AbortSignal): Promise<UpsertCustomerResponse> {
  const body = { full_name: validateCustomerName(input.fullName), email: validateCustomerEmail(input.email), phone: validateCustomerPhone(input.phone), is_active: input.isActive }
  const id = input.id === null ? null : backendId(input.id)
  return customersRequest(async () => {
    const data = await backendHttp(id === null ? 'customers' : 'customers/' + id, id === null ? 'POST' : 'PUT', body, signal)
    if (data.schema_version !== 1) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    const row = object(data.customer)
    if (id !== null && row.id !== id) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    return parseUpsertCustomerResponse({ id: apiId(row.id), full_name: row.full_name, email: row.email, phone: row.phone, is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at })
  }, false, signal)
}
