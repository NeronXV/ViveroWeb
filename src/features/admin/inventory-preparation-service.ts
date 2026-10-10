import { apiId, backendHttp, BackendHttpError, decimal, list, object } from '../../lib/backend-http'
import { backendId, requireBackendAccess } from '../auth/backend-runtime'

export interface InventoryPermissions { canRecordCount: boolean; canReceive: boolean; canApproveCounts: boolean }
export interface CountBaseline { productId: string; branchId: string; quantity: string; movementId: number }
export interface CountObservation {
  id: string; productId: string; branchId: string; observedQuantity: number; baselineQuantity: number
  status: 'PENDING' | 'APPLIED' | 'CLOSED' | 'REJECTED'; reason: string
}
function permissions(value: unknown): InventoryPermissions {
  const p = object(value)
  if (['can_record_count', 'can_receive', 'can_approve_counts'].some(k => typeof p[k] !== 'boolean')) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return { canRecordCount: p.can_record_count as boolean, canReceive: p.can_receive as boolean, canApproveCounts: p.can_approve_counts as boolean }
}
export function parseObservation(value: unknown): CountObservation {
  const r = object(value)
  if (r.schema_version !== 1 || !['PENDING', 'APPLIED', 'CLOSED', 'REJECTED'].includes(String(r.status)) || typeof r.reason !== 'string') throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  const observed = decimal(r.observed_quantity), baseline = decimal(r.baseline_quantity)
  if (!Number.isInteger(observed) || observed < 0 || baseline < 0) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return { id: apiId(r.observation_id), productId: apiId(r.product_id), branchId: apiId(r.branch_id),
    observedQuantity: observed, baselineQuantity: baseline, status: r.status as CountObservation['status'], reason: r.reason }
}
function message(error: unknown): never {
  if (error instanceof BackendHttpError) {
    if (error.code === 'INVENTORY_COUNT_STALE') throw new Error('Hubo movimientos después del conteo. Registra un nuevo conteo antes de aprobar.')
    if (error.code === 'INVENTORY_OWNER_REQUIRED') throw new Error('Esta operación requiere la autorización de un propietario.')
    if (error.code === 'INVENTORY_DECISION_CONFLICT') throw new Error('Este conteo ya fue resuelto. Actualiza la lista para consultar el resultado.')
  }
  throw error
}
export async function fetchInventoryPermissions(signal?: AbortSignal): Promise<InventoryPermissions> {
  const r = await backendHttp('inventory/permissions', 'GET', undefined, signal)
  if (r.schema_version !== 1 || apiId(r.branch_id) !== String(requireBackendAccess().context.branch?.id)) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return permissions(r.permissions)
}
export async function fetchCountObservations(signal?: AbortSignal): Promise<CountObservation[]> {
  const items: CountObservation[] = []
  let after: string | null = null
  do {
    const r = await backendHttp(`inventory/count-observations?limit=100${after ? `&after_id=${after}` : ''}`, 'GET', undefined, signal)
    if (r.schema_version !== 1 || apiId(r.branch_id) !== String(requireBackendAccess().context.branch?.id)) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    items.push(...list(r.items).map(parseObservation))
    after = r.next_after_id === null ? null : apiId(r.next_after_id)
  } while (after !== null)
  return items
}
export async function fetchCountBaseline(productId: string, signal?: AbortSignal): Promise<CountBaseline> {
  const r = await backendHttp(`inventory/count-baseline?product_id=${backendId(productId)}`, 'GET', undefined, signal)
  if (r.schema_version !== 1 || apiId(r.product_id) !== productId || apiId(r.branch_id) !== String(requireBackendAccess().context.branch?.id)
    || !Number.isInteger(r.movement_id) || Number(r.movement_id) < 0 || Number(r.movement_id) > 4294967295 || decimal(r.quantity) < 0) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return { productId, branchId: apiId(r.branch_id), quantity: r.quantity as string, movementId: r.movement_id as number }
}

interface Attempt { path: string; body: Record<string, unknown>; key: string }
function journalKey(): string {
  const { context } = requireBackendAccess()
  if (!context.branch) throw new Error('Selecciona una sucursal antes de registrar el conteo.')
  return `vivero:inventory-preparation:${context.user.id}:${context.branch.id}`
}
export function pendingInventoryPreparation(): Attempt | null {
  const raw = localStorage.getItem(journalKey())
  if (!raw) return null
  try {
    const r = object(JSON.parse(raw))
    if (typeof r.path !== 'string' || !/^inventory\/count-observations(?:\/[1-9][0-9]*)?$/.test(r.path)
      || typeof r.key !== 'string' || !/^[a-f0-9-]{36}$/.test(r.key)) throw new Error()
    return { path: r.path, body: object(r.body), key: r.key }
  } catch { throw new Error('No pudimos leer el intento guardado. Conserva los datos y solicita revisión.') }
}
async function sendAttempt(path: string, body: Record<string, unknown>): Promise<CountObservation> {
  const storageKey = journalKey()
  const previous = pendingInventoryPreparation()
  if (previous && (previous.path !== path || JSON.stringify(previous.body) !== JSON.stringify(body))) {
    throw new Error('Comprueba primero el resultado del conteo pendiente antes de registrar otra operación.')
  }
  const attempt = previous ?? { path, body, key: crypto.randomUUID() }
  // Persist before POST; failure to persist must prevent a new operation.
  localStorage.setItem(storageKey, JSON.stringify(attempt))
  try {
    let r: Record<string, unknown>
    if (previous && path === 'inventory/count-observations') {
      try { r = await backendHttp(path + '/result', 'POST', body, undefined, attempt.key) }
      catch (error) {
        if (!(error instanceof BackendHttpError) || error.status !== 404) throw error
        r = await backendHttp(path, 'POST', body, undefined, attempt.key)
      }
    } else r = await backendHttp(path, 'POST', body, undefined, attempt.key)
    const result = parseObservation(r)
    if (result.branchId !== String(requireBackendAccess().context.branch?.id)
      || (body.product_id !== undefined && result.productId !== String(body.product_id))
      || (path !== 'inventory/count-observations' && result.id !== path.split('/').at(-1))) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    if (journalKey() !== storageKey) throw new Error('Cambió la cuenta o sucursal. El intento original se conserva.')
    localStorage.removeItem(storageKey)
    return result
  } catch (error) {
    // Explicit rejections have no uncertain write. Network/invalid responses stay.
    if (error instanceof BackendHttpError && (error.status === 409 || (!previous && [400, 403].includes(error.status)))) localStorage.removeItem(storageKey)
    return message(error)
  }
}
export function recordInventoryCountObservation(input: { productId: string; countedQuantity: number; reason: string; baseline: CountBaseline }): Promise<CountObservation> {
  if (!Number.isInteger(input.countedQuantity) || input.countedQuantity < 0 || input.countedQuantity > 99999999999 || input.reason.trim().length < 3 || input.reason.trim().length > 240) throw new Error('Revisa la cantidad y el motivo del conteo.')
  if (!input.baseline || input.baseline.productId !== input.productId || input.baseline.branchId !== String(requireBackendAccess().context.branch?.id)) throw new Error('Consulta las existencias de esta planta antes de contar.')
  return sendAttempt('inventory/count-observations', { product_id: backendId(input.productId), counted_quantity: String(input.countedQuantity), reason: input.reason.trim(),
    baseline_quantity: input.baseline.quantity, baseline_movement_id: input.baseline.movementId })
}
export function decideCountObservation(id: string, decision: 'APPROVE' | 'REJECT', reason: string): Promise<CountObservation> {
  if (reason.trim().length < 3 || reason.trim().length > 240) throw new Error('Escribe un motivo de entre 3 y 240 caracteres.')
  return sendAttempt(`inventory/count-observations/${backendId(id)}`, { decision, reason: reason.trim() })
}
export function recoverInventoryPreparation(): Promise<CountObservation> {
  const pending = pendingInventoryPreparation()
  if (!pending) throw new Error('No hay un conteo pendiente de comprobar.')
  return sendAttempt(pending.path, pending.body)
}
