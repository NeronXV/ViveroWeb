import { getSupabaseClient } from '../../lib/supabase/client'
import {
  parseCashierClaimResponse,
  parseCashierConfirmResponse,
  parseCashierPaymentResultResponse,
  parseCashierReleaseClaimResponse,
  parseCashierSaleDetailResponse,
  parseCashierSalesResponse,
} from './cashier-parser'
import type {
  CashierClaimResponse,
  CashierConfirmResponse,
  CashierCursor,
  CashierPaymentMethod,
  CashierPaymentResultResponse,
  CashierReleaseClaimResponse,
  CashierSaleDetailResponse,
  CashierSalesResponse,
} from './cashier-types'

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

// Nuevas llamadas de la fase de cobros reales
export async function claimSaleForPayment(
  saleId: string,
  claimToken: string | null = null,
  callerSignal?: AbortSignal,
): Promise<CashierClaimResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const rpcParams = {
      p_sale_id: saleId,
      p_claim_token: claimToken || null,
    }

    const { data, error } = await client
      .rpc('claim_sale_for_payment', rpcParams)
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'SALE_UNAVAILABLE') {
        throw new CashierServiceError('La venta ya no está disponible para su cobro.', code)
      }
      if (code === 'SALE_STATUS_INVALID') {
        throw new CashierServiceError('El estado de la venta no es válido para procesar cobro.', code)
      }
      if (code === 'CLAIM_UNAVAILABLE') {
        throw new CashierServiceError('La venta está siendo cobrada por otro cajero.', code)
      }
      if (code === 'CLAIM_EXPIRED') {
        throw new CashierServiceError('Tu reserva de cobro para esta venta ha expirado.', code)
      }
      if (code === 'CLAIM_NOT_OWNED') {
        throw new CashierServiceError('La reserva de cobro para esta venta pertenece a otro cajero.', code)
      }
      throw new CashierServiceError('No fue posible reservar la venta para cobro.', code)
    }

    try {
      const response = parseCashierClaimResponse(data)
      if (response.sale_id !== saleId) {
        throw new Error('La respuesta no corresponde a la venta reclamada.')
      }
      if (claimToken !== null && (response.claim_token !== claimToken || !response.renewed)) {
        throw new Error('La renovación no conservó el claim esperado.')
      }
      return response
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
    throw new CashierServiceError('No fue posible reservar la venta para cobro.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function releaseSalePaymentClaim(
  saleId: string,
  claimToken: string,
  callerSignal?: AbortSignal,
): Promise<CashierReleaseClaimResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const rpcParams = {
      p_sale_id: saleId,
      p_claim_token: claimToken,
    }

    const { data, error } = await client
      .rpc('release_sale_payment_claim', rpcParams)
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'SALE_UNAVAILABLE') {
        throw new CashierServiceError('La venta ya no está disponible.', code)
      }
      if (code === 'CLAIM_NOT_OWNED') {
        throw new CashierServiceError('No posees la reserva de cobro de esta venta.', code)
      }
      throw new CashierServiceError('No fue posible liberar la reserva de cobro.', code)
    }

    try {
      const response = parseCashierReleaseClaimResponse(data)
      if (response.sale_id !== saleId || response.claim_token !== claimToken) {
        throw new Error('La respuesta no corresponde al claim liberado.')
      }
      return response
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
    throw new CashierServiceError('No fue posible liberar la reserva de cobro.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export interface ConfirmPaymentParams {
  saleId: string
  claimToken: string
  idempotencyKey: string
  method: CashierPaymentMethod
  amountReceivedCents?: number | null
  reference?: string | null
}

export async function confirmSalePayment(
  params: ConfirmPaymentParams,
  callerSignal?: AbortSignal,
): Promise<CashierConfirmResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const rpcParams = {
      p_sale_id: params.saleId,
      p_claim_token: params.claimToken,
      p_idempotency_key: params.idempotencyKey,
      p_method: params.method,
      p_amount_received_cents: params.amountReceivedCents ?? null,
      p_reference: params.reference ?? null,
    }

    const { data, error } = await client
      .rpc('confirm_sale_payment', rpcParams)
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'SALE_UNAVAILABLE') {
        throw new CashierServiceError('La venta ya no está disponible para su cobro.', code)
      }
      if (code === 'IDEMPOTENCY_KEY_INVALID') {
        throw new CashierServiceError('La clave de idempotencia del intento no es válida.', code)
      }
      if (code === 'PAYMENT_METHOD_INVALID') {
        throw new CashierServiceError('El método de pago seleccionado no es válido.', code)
      }
      if (code === 'IDEMPOTENCY_CONFLICT') {
        throw new CashierServiceError('Conflicto de idempotencia detectado. Se intentó pagar la misma venta con parámetros distintos.', code)
      }
      if (code === 'SALE_ALREADY_PAID') {
        throw new CashierServiceError('La venta ya ha sido cobrada por completo.', code)
      }
      if (code === 'SALE_STATUS_INVALID') {
        throw new CashierServiceError('El estado de la venta no es válido para procesar cobro.', code)
      }
      if (code === 'SALE_TOTAL_INVALID') {
        throw new CashierServiceError('El total de la venta no es válido.', code)
      }
      if (code === 'CLAIM_REQUIRED') {
        throw new CashierServiceError('Se requiere reservar la venta para cobro antes de confirmar el pago.', code)
      }
      if (code === 'CLAIM_NOT_OWNED') {
        throw new CashierServiceError('La reserva de cobro para esta venta pertenece a otro cajero o no es válida.', code)
      }
      if (code === 'CLAIM_EXPIRED') {
        throw new CashierServiceError('Tu reserva de cobro para esta venta ha expirado.', code)
      }
      if (code === 'CASH_AMOUNT_INSUFFICIENT') {
        throw new CashierServiceError('La cantidad de efectivo recibida es insuficiente.', code)
      }
      if (code === 'TRANSFER_REFERENCE_REQUIRED') {
        throw new CashierServiceError('La referencia de transferencia bancaria es obligatoria.', code)
      }
      if (code === 'PAYMENT_DATA_INVALID') {
        throw new CashierServiceError('Los datos del pago son inválidos. Verifica el formato de la referencia.', code)
      }
      throw new CashierServiceError('No fue posible confirmar el pago de la venta.', code)
    }

    try {
      const response = parseCashierConfirmResponse(data)
      const normalizedReference = params.reference?.trim() || null
      if (
        response.sale.id !== params.saleId
        || response.payment.sale_id !== params.saleId
        || response.payment.idempotency_key !== params.idempotencyKey
        || response.payment.method !== params.method
        || response.payment.reference !== normalizedReference
      ) {
        throw new Error('La confirmación no corresponde al intento enviado.')
      }
      if (params.method === 'CASH' && response.payment.amount_received_cents !== params.amountReceivedCents) {
        throw new Error('El efectivo confirmado no corresponde al intento enviado.')
      }
      return response
    } catch (parseError) {
      throw new CashierServiceError(
        parseError instanceof Error ? parseError.message : 'La respuesta de confirmación del backend es incompatible.',
        'INCOMPATIBLE_RESPONSE',
      )
    }
  } catch (error) {
    if (error instanceof CashierServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new CashierServiceError('Tiempo de espera agotado al conectar con el servidor.', 'TIMEOUT')
    }
    throw new CashierServiceError('No fue posible confirmar el pago de la venta.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function getCashierPaymentResult(
  saleId: string,
  idempotencyKey: string,
  callerSignal?: AbortSignal,
): Promise<CashierPaymentResultResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), CASHIER_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const client = getSupabaseClient()
    const rpcParams = {
      p_sale_id: saleId,
      p_idempotency_key: idempotencyKey,
    }

    const { data, error } = await client
      .rpc('get_cashier_payment_result', rpcParams)
      .abortSignal(signal)

    if (error) {
      const code = error.message
      if (code === 'CASHIER_UNAUTHORIZED') {
        throw new CashierServiceError('Acceso denegado. No tienes permisos para operar como cajero.', code)
      }
      if (code === 'PAYMENT_RESULT_INVALID') {
        throw new CashierServiceError('Los datos de recuperación de pago son inválidos.', code)
      }
      throw new CashierServiceError('No fue posible consultar el resultado del cobro.', code)
    }

    try {
      return parseCashierPaymentResultResponse(data)
    } catch (parseError) {
      throw new CashierServiceError(
        parseError instanceof Error ? parseError.message : 'La respuesta de recuperación del backend es incompatible.',
        'INCOMPATIBLE_RESPONSE',
      )
    }
  } catch (error) {
    if (error instanceof CashierServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new CashierServiceError('Tiempo de espera agotado al conectar con el servidor.', 'TIMEOUT')
    }
    throw new CashierServiceError('No fue posible consultar el resultado del cobro.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}
