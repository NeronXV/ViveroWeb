import { getSupabaseClient } from '../../lib/supabase/client'
import { AdminServiceError } from './admin-service'
import {
  parseCustomers,
  parseUpsertCustomerResponse,
  validateCustomerName,
  validateCustomerEmail,
  validateCustomerPhone,
} from './admin-customers-parser'
import type {
  AdminCustomer,
  UpsertCustomerInput,
  UpsertCustomerResponse,
} from './admin-customers-types'

const CUSTOMERS_TIMEOUT_MS = 8_000

async function customersRequest<T>(
  action: (signal: AbortSignal) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>,
  parser: (data: unknown) => T,
  isSearch: boolean,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), CUSTOMERS_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal

  try {
    const { data, error } = await action(signal)
    if (error) {
      const code = error.message || error.code || 'UNKNOWN'
      
      if (code === 'Customer management is not allowed' || code === 'Only user managers can update customers' || error.code === '42501') {
        if (isSearch) {
          throw new AdminServiceError('Acceso denegado. No tienes permisos para buscar clientes.', 'UNAUTHORIZED_SEARCH')
        } else {
          throw new AdminServiceError('Acceso denegado. No tienes permisos para administrar clientes.', 'UNAUTHORIZED_MANAGEMENT')
        }
      }
      if (code === 'Customer search is not allowed') {
        throw new AdminServiceError('Acceso denegado. No tienes permisos para buscar clientes.', 'UNAUTHORIZED_SEARCH')
      }
      if (code === 'Customer query is invalid' || error.code === '22023') {
        if (isSearch) {
          throw new AdminServiceError('La consulta de búsqueda no es válida.', 'INVALID_QUERY')
        } else {
          throw new AdminServiceError('El nombre del cliente no es válido.', 'INVALID_NAME')
        }
      }
      if (code === 'Customer name is invalid') {
        throw new AdminServiceError('El nombre del cliente no es válido.', 'INVALID_NAME')
      }
      if (code === 'Email is already registered' || error.code === '23505') {
        throw new AdminServiceError('El correo electrónico ya se encuentra registrado.', 'EMAIL_DUPLICATE')
      }

      throw new AdminServiceError('No fue posible completar la operación de clientes en el servidor.', error.code || 'SERVER_ERROR')
    }

    try {
      return parser(data)
    } catch (parseError) {
      throw new AdminServiceError(
        parseError instanceof Error ? parseError.message : 'El backend devolvió un contrato incompatible.',
        'INCOMPATIBLE_RESPONSE'
      )
    }
  } catch (error) {
    if (error instanceof AdminServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new AdminServiceError('La operación de clientes agotó el tiempo de espera.', 'TIMEOUT')
    }
    if (callerSignal?.aborted) {
      throw new DOMException('Operación cancelada.', 'AbortError')
    }
    throw new AdminServiceError('No fue posible realizar la operación de clientes.', 'UNKNOWN')
  } finally {
    clearTimeout(timeoutId)
  }
}

export function searchCustomers(
  query: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<AdminCustomer[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    return Promise.resolve([])
  }
  if (trimmed.length > 80) {
    throw new AdminServiceError('La búsqueda no puede superar 80 caracteres.', 'INVALID_QUERY')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AdminServiceError('El límite de búsqueda debe estar entre 1 y 50.', 'INVALID_QUERY')
  }

  return customersRequest(
    async (requestSignal) => {
      const q = getSupabaseClient().rpc('search_customers', {
        p_query: trimmed,
        p_limit: limit,
      })
      return q.abortSignal(requestSignal)
    },
    parseCustomers,
    true,
    signal
  )
}

export function upsertCustomer(
  input: UpsertCustomerInput,
  signal?: AbortSignal,
): Promise<UpsertCustomerResponse> {
  const validatedName = validateCustomerName(input.fullName)
  const validatedEmail = validateCustomerEmail(input.email)
  const validatedPhone = validateCustomerPhone(input.phone)

  return customersRequest(
    async (requestSignal) => {
      const q = getSupabaseClient().rpc('upsert_customer', {
        p_id: input.id || null,
        p_full_name: validatedName,
        p_email: validatedEmail,
        p_phone: validatedPhone,
        p_is_active: input.isActive,
      })
      return q.abortSignal(requestSignal)
    },
    parseUpsertCustomerResponse,
    false,
    signal
  )
}
