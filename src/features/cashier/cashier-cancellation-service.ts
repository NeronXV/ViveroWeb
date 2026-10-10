import { backendHttp, BackendHttpError } from '../../lib/backend-http'
import { backendId } from '../auth/backend-runtime'
export async function cancellationAllowed(saleId: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await backendHttp(`cashier/sales/${backendId(saleId)}/cancel-options`, 'GET', undefined, signal)
    if (Object.keys(r).length !== 4 || r.schema_version !== 1 || r.sale_id !== backendId(saleId)
      || typeof r.can_cancel !== 'boolean' || (r.can_cancel ? r.blocked_reason !== null : typeof r.blocked_reason !== 'string')) throw new Error('No se pudo verificar la cancelación.')
    return r.can_cancel
  } catch (error) {
    // Older APIs do not advertise this operation: leave the action unavailable.
    if (error instanceof BackendHttpError && [403, 404].includes(error.status)) return false
    throw error
  }
}
