import { requireBackendAccess } from '../features/auth/backend-runtime'

export class BackendHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(status === 401 ? 'La sesión ya no es válida.' : status === 403 ? 'No tienes permiso para esta operación.' : 'No se confirmó la operación. Consulta su resultado antes de repetirla.') }
}
export async function backendHttp(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, key?: string): Promise<Record<string, unknown>> {
  const { token, context } = requireBackendAccess()
  let response: Response
  try {
    response = await fetch('/api/v1/' + path, { method, credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
      headers: { Authorization: 'Bearer ' + token, 'X-Expected-Actor-Id': String(context.user.id), ...(context.branch ? { 'X-Expected-Branch-Id': String(context.branch.id) } : {}), 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  } catch { if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError'); throw new BackendHttpError(0, 'CONNECTION_FAILED') }
  let data: unknown
  try { data = await response.json() } catch { throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE') }
  const root = object(data)
  if (!response.ok) throw new BackendHttpError(response.status, typeof root.error === 'string' && /^[A-Z_]{3,64}$/.test(root.error) ? root.error : 'REQUEST_FAILED')
  return root
}
export function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE'); return value as Record<string, unknown> }
export function list(value: unknown): Record<string, unknown>[] { if (!Array.isArray(value)) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE'); return value.map(object) }
export function apiId(value: unknown): string { if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4294967295) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE'); return String(value) }
export function utc(value: unknown): string {
  if (typeof value !== 'string') throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  const date = value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
  if (!Number.isFinite(Date.parse(date))) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return new Date(date).toISOString()
}
export function decimal(value: unknown): number {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,3})?$/.test(value) || !Number.isFinite(Number(value))) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return Number(value)
}
