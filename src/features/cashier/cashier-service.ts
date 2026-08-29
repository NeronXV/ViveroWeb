import { getSupabaseClient } from '../../lib/supabase/client'
import { parseCashierSaleDetailResponse, parseCashierSalesResponse } from './cashier-parser'
import type { CashierCursor, CashierSaleDetailResponse, CashierSalesResponse } from './cashier-types'

const CASHIER_TIMEOUT_MS = 8_000

export class CashierServiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'CashierServiceError'
  }
}

export interface GetSalesParams {
  limit?: number
  cursor?: CashierCursor | null
}

export async function fetchCashierSales(
  params: GetSalesParams,
  callerSignal?: AbortSignal,
): Promise<CashierSalesResponse> {
  const { limit = 25, cursor = null } = params
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const rpcParams = {
      p_limit: limit,
      p_after_created_at: cursor?.createdAt ?? null,
      p_after_id: cursor?.id ?? null,
    }

    const { data, error } = await client
      .rpc('get_cashier_sales', rpcParams)
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'CASHIER_PAGE_LIMIT_INVALID') {
        throw new CashierServiceError('Límite de página no válido.', code)
      }
      if (code === 'CASHIER_CURSOR_INVALID') {
        throw new CashierServiceError('El cursor de paginación proporcionado no es válido.', code)
      }
      throw new CashierServiceError('No fue posible cargar las ventas de la caja.', code)
    }

    try {
      return parseCashierSalesResponse(data)
    } catch (parseError) {
      throw new CashierServiceError(
        parseError instanceof Error ? parseError.message : 'La respuesta del backend es incompatible.',
        'INCOMPATIBLE_RESPONSE',
      )
    }
  } catch (error) {
    if (error instanceof CashierServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new CashierServiceError('Tiempo de espera agotado al conectar con el servidor.', 'TIMEOUT')
    }
    throw new CashierServiceError('No fue posible cargar las ventas de la caja.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function fetchCashierSaleDetail(
  saleId: string,
  callerSignal?: AbortSignal,
): Promise<CashierSaleDetailResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const { data, error } = await client
      .rpc('get_cashier_sale_detail', { p_sale_id: saleId })
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'SALE_UNAVAILABLE') {
        throw new CashierServiceError('La venta ya no está disponible para su cobro.', code)
      }
      if (code === 'SALE_DATA_INVALID') {
        throw new CashierServiceError('Los datos del detalle de la venta no son válidos.', code)
      }
      throw new CashierServiceError('No fue posible cargar el detalle de la venta.', code)
    }

    try {
      return parseCashierSaleDetailResponse(data)
    } catch (parseError) {
      throw new CashierServiceError(
        parseError instanceof Error ? parseError.message : 'La respuesta del backend es incompatible.',
        'INCOMPATIBLE_RESPONSE',
      )
    }
  } catch (error) {
    if (error instanceof CashierServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new CashierServiceError('Tiempo de espera agotado al conectar con el servidor.', 'TIMEOUT')
    }
    throw new CashierServiceError('No fue posible cargar el detalle de la venta.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}
