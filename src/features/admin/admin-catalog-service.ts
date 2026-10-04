import { backendId, requireBackendAccess } from '../auth/backend-runtime'
import { apiId, backendHttp, BackendHttpError, list, object, decimal } from '../../lib/backend-http'
import { AdminServiceError } from './admin-service'
import { parseAdminCategory, parseAdminProduct } from './admin-catalog-parser'
import type { AdminCategory, AdminProduct, UpsertCategoryInput, UpsertProductInput } from './admin-catalog-types'

async function safe<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await action() } catch (error) {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (error instanceof AdminServiceError) throw error
    if (error instanceof BackendHttpError) throw new AdminServiceError(error.code === 'DUPLICATE' ? 'El código o nombre ya está registrado.' : error.status === 403 ? 'No tienes permiso o una sucursal activa para esta operación.' : error.message, error.code)
    throw new AdminServiceError('No se confirmó la operación del catálogo. Actualiza antes de repetirla.', 'INCOMPATIBLE_RESPONSE')
  }
}
async function pages(resource: string, query: URLSearchParams, signal?: AbortSignal) {
  const rows: Record<string, unknown>[] = []; let after = 0
  do {
    query.set('limit', '100'); query.set('status', 'all'); if (after) query.set('after_id', String(after))
    const data = await backendHttp(resource + '?' + query, 'GET', undefined, signal), current = list(data.items)
    for (const row of current) { const id = Number(apiId(row.id)); if (id <= after) throw new Error('Invalid page'); after = id; rows.push(row) }
    if (data.next_after_id === null) break
    if (data.next_after_id !== after || current.length !== 100) throw new Error('Invalid cursor')
  } while (after < 4294967295)
  return rows
}
function category(row: Record<string, unknown>) {
  return parseAdminCategory({ id: apiId(row.id), name: row.name, description: row.description === '' ? null : row.description, is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at })
}
function product(row: Record<string, unknown>, categories: AdminCategory[]) {
  const { image: _image, effective_price_cents: _price, active_promotion: _promotion, ...fields } = row
  void _image; void _price; void _promotion
  const categoryId = apiId(row.category_id), matched = categories.find(c => c.id === categoryId)
  if (!matched) throw new Error('Missing category')
  return parseAdminProduct({ ...fields, id: apiId(row.id), category_id: categoryId, scientific_name: row.scientific_name === '' ? null : row.scientific_name,
    minimum_stock: typeof row.minimum_stock === 'string' ? decimal(row.minimum_stock) : row.minimum_stock, categories: { name: matched.name } })
}
export function fetchAdminCategories(signal?: AbortSignal): Promise<AdminCategory[]> {
  return safe(async () => (await pages('categories', new URLSearchParams(), signal)).map(category), signal)
}
export function fetchAdminProducts(params: { search?: string; categoryId?: string | null; status?: 'all' | 'active' | 'inactive' }, signal?: AbortSignal): Promise<AdminProduct[]> {
  return safe(async () => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search.trim())
    if (params.categoryId) query.set('category_id', String(backendId(params.categoryId)))
    const [rows, categories] = await Promise.all([pages('products', query, signal), fetchAdminCategories(signal)])
    return rows.map(row => product(row, categories)).filter(p => !params.status || params.status === 'all' || p.isActive === (params.status === 'active'))
  }, signal)
}
export function upsertProduct(input: UpsertProductInput, signal?: AbortSignal): Promise<AdminProduct> {
  return safe(async () => {
    const id = input.id ? backendId(input.id) : null
    const data = await backendHttp(id ? 'products/' + id : 'products', id ? 'PATCH' : 'POST', {
      internal_code: input.internalCode.trim(), barcode: input.barcode?.trim() || null, common_name: input.commonName.trim(), scientific_name: input.scientificName?.trim() || null,
      description: input.description?.trim() || '', category_id: backendId(input.categoryId), price_cents: input.priceCents, wholesale_price_cents: input.wholesalePriceCents,
      unit: input.unit, minimum_stock: input.minimumStock, watering_advice: input.wateringAdvice?.trim() || '', light_type: input.lightType?.trim() || '', recommended_climate: input.recommendedClimate?.trim() || '', is_active: input.isActive,
    }, signal)
    const saved = apiId(data.id)
    if (id !== null && Number(saved) !== id) throw new Error('Wrong product')
    const rows = await fetchAdminProducts({}, signal), row = rows.find(p => p.id === saved)
    if (!row) throw new Error('Missing product'); return row
  }, signal)
}
export function upsertCategory(input: UpsertCategoryInput, signal?: AbortSignal): Promise<AdminCategory> {
  return safe(async () => {
    const id = input.id ? backendId(input.id) : null
    const result = await backendHttp(id ? 'categories/' + id : 'categories', id ? 'PATCH' : 'POST', { name: input.name.trim(), description: input.description?.trim() || '', is_active: input.isActive }, signal)
    const saved = apiId(result.id), row = (await fetchAdminCategories(signal)).find(c => c.id === saved)
    if (!row || (id !== null && Number(saved) !== id)) throw new Error('Wrong category'); return row
  }, signal)
}
export async function uploadProductImage(productId: string, file: Blob, existingImageId?: string, signal?: AbortSignal): Promise<{ imageId: string; storagePath: string }> {
  return safe(async () => {
    const product = backendId(productId), oldId = existingImageId ? backendId(existingImageId) : null
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new AdminServiceError('La fotografía debe pesar entre 1 byte y 5 MiB.', 'FILE_TOO_LARGE')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new AdminServiceError('Usa una fotografía JPEG, PNG o WEBP.', 'INVALID_FORMAT')
    const { token } = requireBackendAccess()
    const response = await fetch(`/api/v1/products/${product}/images`, { method: 'POST', body: file, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer ' + token, 'Content-Type': file.type }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
    if (!response.ok) throw new BackendHttpError(response.status, 'IMAGE_UPLOAD_FAILED')
    const data = object(await response.json()), imageId = apiId(data.id)
    if (data.url !== '/api/v1/images/' + imageId) throw new Error('Invalid image')
    await backendHttp(`products/${product}/images/${imageId}`, 'PATCH', { is_primary: true }, signal)
    if (oldId && String(oldId) !== imageId) await backendHttp(`products/${product}/images/${oldId}`, 'DELETE', undefined, signal)
    return { imageId, storagePath: data.url as string }
  }, signal)
}
