import { getSupabaseClient } from '../../lib/supabase/client'
import {
  parseAdminWebOrders,
  parsePublicOrderOptions,
  parseSubmitWebOrderResult,
  parseWebOrderStatusResult,
} from './web-order-parser'
import type {
  AdminWebOrdersResponse,
  PublicOrderOptions,
  SubmitWebOrderInput,
  SubmitWebOrderResult,
  WebOrderStatus,
  WebOrderStatusResult,
} from './web-order-types'

const ORDER_TIMEOUT_MS = 10_000

export class WebOrderServiceError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'WebOrderServiceError'
  }
}

async function request<T>(
  rpc: 'get_public_web_order_options' | 'submit_web_order' | 'get_admin_web_orders' | 'set_admin_web_order_status',
  parameters: Record<string, unknown>,
  parser: (value: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeout = new AbortController()
  const timeoutId = window.setTimeout(() => timeout.abort(), ORDER_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeout.signal]) : timeout.signal
  try {
    const { data, error } = await getSupabaseClient().rpc(rpc, parameters).abortSignal(signal)
    if (error) {
      const code = error.message
      if (error.code === 'PGRST202' || error.code === '42883') throw new WebOrderServiceError('El servicio de pedidos todavía no está habilitado en este entorno.', 'CONTRACT_UNAVAILABLE')
      if (code === 'WEB_ORDER_RATE_LIMITED') throw new WebOrderServiceError('Ya recibimos varios pedidos con este contacto. Espera unos minutos antes de intentar nuevamente.', code)
      if (code === 'WEB_ORDER_BRANCH_UNAVAILABLE') throw new WebOrderServiceError('La sucursal seleccionada ya no está disponible.', code)
      if (code === 'WEB_ORDER_ITEMS_UNAVAILABLE') throw new WebOrderServiceError('Uno de los productos ya no está disponible. Actualiza el catálogo.', code)
      if (code === 'WEB_ORDER_ADMIN_UNAUTHORIZED') throw new WebOrderServiceError('No tienes permiso para consultar o actualizar estos pedidos.', code)
      if (code === 'WEB_ORDER_STATUS_INVALID') throw new WebOrderServiceError('Ese cambio de estado ya no está permitido. Actualiza la lista.', code)
      throw new WebOrderServiceError('No fue posible completar la operación de pedido.', code)
    }
    try {
      return parser(data)
    } catch {
      throw new WebOrderServiceError('El servidor devolvió una respuesta de pedidos incompatible.', 'INCOMPATIBLE_RESPONSE')
    }
  } catch (error) {
    if (error instanceof WebOrderServiceError) throw error
    if (callerSignal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (signal.aborted) throw new WebOrderServiceError('El servicio de pedidos tardó demasiado en responder.', 'TIMEOUT')
    throw new WebOrderServiceError('No fue posible conectar con el servicio de pedidos.', 'UNKNOWN')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function loadPublicOrderOptions(signal?: AbortSignal): Promise<PublicOrderOptions> {
  return request('get_public_web_order_options', {}, parsePublicOrderOptions, signal)
}

export function submitWebOrder(input: SubmitWebOrderInput, signal?: AbortSignal): Promise<SubmitWebOrderResult> {
  return request('submit_web_order', {
    p_order_id: input.orderId,
    p_branch_id: input.branchId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail,
    p_notes: input.notes,
    p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  }, parseSubmitWebOrderResult, signal)
}

export function loadAdminWebOrders(signal?: AbortSignal): Promise<AdminWebOrdersResponse> {
  return request('get_admin_web_orders', {
    p_limit: 100,
    p_after_created_at: null,
    p_after_id: null,
    p_status: null,
  }, parseAdminWebOrders, signal)
}

export function setAdminWebOrderStatus(
  orderId: string,
  nextStatus: WebOrderStatus,
  signal?: AbortSignal,
): Promise<WebOrderStatusResult> {
  return request('set_admin_web_order_status', {
    p_order_id: orderId,
    p_status: nextStatus,
    p_observation: null,
  }, parseWebOrderStatusResult, signal)
}
