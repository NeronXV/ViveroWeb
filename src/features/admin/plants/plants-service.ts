import { apiId, backendHttp, BackendHttpError, object } from '../../../lib/backend-http'
import { backendId, requireBackendAccess } from '../../auth/backend-runtime'
import { fetchAdminProducts } from '../admin-catalog-service'
import type { AdminProduct } from '../admin-catalog-types'
import { guardedProductPatch, productRevision } from './cataloging-service'

export interface PlantPreparation {
  productId: string; branchId: string
  commercialState: 'IMPORTED_PENDING' | 'PENDING' | 'READY' | 'DISABLED'
  priceConfirmed: boolean; initialCountConfirmed: boolean; activated: boolean
  ready: boolean; legacyCompatibility: boolean; reasons: string[]
}
const reasons = ['DISABLED', 'PRODUCT_PENDING', 'CATEGORY_INACTIVE', 'PRICE_PENDING', 'INITIAL_COUNT_PENDING', 'ACTIVATION_PENDING']
export const preparationLabels: Record<string, string> = {
  DISABLED: 'Planta inactiva', PRODUCT_PENDING: 'Habilitar planta', CATEGORY_INACTIVE: 'Categoría inactiva',
  PRICE_PENDING: 'Confirmar precio', INITIAL_COUNT_PENDING: 'Aprobar conteo inicial', ACTIVATION_PENDING: 'Habilitar venta en esta sucursal',
}
export const stateLabels: Record<PlantPreparation['commercialState'], string> = {
  IMPORTED_PENDING: 'Por completar', PENDING: 'Por completar', READY: 'Lista para vender', DISABLED: 'Inactiva',
}
export function parsePreparation(value: unknown, productId: string, branchId: string): PlantPreparation {
  const p = object(value)
  if (p.schema_version !== 1 || apiId(p.product_id) !== productId || apiId(p.branch_id) !== branchId
    || !['IMPORTED_PENDING', 'PENDING', 'READY', 'DISABLED'].includes(String(p.commercial_state))
    || ['price_confirmed', 'initial_count_confirmed', 'activated', 'ready', 'legacy_compatibility'].some(k => typeof p[k] !== 'boolean')
    || !Array.isArray(p.reasons) || p.reasons.some(r => typeof r !== 'string' || !reasons.includes(r))
    || (p.ready !== (p.commercial_state === 'READY')) || (p.ready && p.reasons.length > 0)) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return { productId, branchId, commercialState: p.commercial_state as PlantPreparation['commercialState'],
    priceConfirmed: p.price_confirmed as boolean, initialCountConfirmed: p.initial_count_confirmed as boolean,
    activated: p.activated as boolean, ready: p.ready as boolean, legacyCompatibility: p.legacy_compatibility as boolean, reasons: p.reasons as string[] }
}
export async function fetchPlantPreparation(productId: string, branchId: string, signal?: AbortSignal): Promise<PlantPreparation> {
  return parsePreparation(await backendHttp(`products/${backendId(productId)}/preparation`, 'GET', undefined, signal), productId, branchId)
}
export async function activatePlant(productId: string, branchId: string): Promise<PlantPreparation> {
  return parsePreparation(await backendHttp(`products/${backendId(productId)}/preparation/activate`, 'POST', {}), productId, branchId)
}
// PATCH only edited fields: saving botany must not confirm a price, disable an
// imported plant or overwrite another worker's unrelated edits.
export async function patchPlant(productId: string, fields: Record<string, unknown>, revision?: number): Promise<AdminProduct> {
  const id = backendId(productId)
  if (Object.keys(fields).length) {
    if (revision !== undefined) await guardedProductPatch(productId, fields, revision)
    else {
      const saved = await backendHttp(`products/${id}`, 'PATCH', fields)
      if (apiId(saved.id) !== productId) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
    }
  }
  if (revision !== undefined) return fetchEditablePlant(productId)
  const product = (await fetchAdminProducts({})).find(p => p.id === productId)
  if (!product) throw new BackendHttpError(502, 'INCOMPATIBLE_RESPONSE')
  return product
}
export async function fetchEditablePlant(productId: string): Promise<AdminProduct> {
  const before = await productRevision(productId)
  const product = (await fetchAdminProducts({})).find(p => p.id === productId)
  const after = await productRevision(productId)
  if (!product || before !== after) throw new BackendHttpError(409, 'CATALOGING_EDIT_CONFLICT')
  return { ...product, editRevision: after }
}
export async function fetchPlantPhoto(imageId: string, signal: AbortSignal): Promise<Blob> {
  const { token } = requireBackendAccess()
  const response = await fetch(`/api/v1/images/${backendId(imageId)}?status=all`, {
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) throw new Error('No se pudo cargar la fotografía.')
  const blob = await response.blob()
  if (blob.size > 5 * 1024 * 1024 || blob.size === 0) throw new Error('Fotografía no compatible.')
  return blob
}
