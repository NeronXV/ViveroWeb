export interface BackendCatalogProduct {
  id: number; internal_code: string; barcode: string | null; common_name: string
  scientific_name: string | null; description: string; category_id: number
  price_cents: number; effective_price_cents: number; unit: string; is_active: true
  watering_advice: string; light_type: string; recommended_climate: string
  image: { id: number; url: string; alt_text: string | null } | null
  active_promotion: { id: number; name: string; discount_percent: number } | null
}
export interface BackendCatalogCategory { id: number; name: string; description: string; is_active: true }
export interface BackendCatalogPage<T> { items: T[]; next_after_id: number | null }
export interface BackendCatalogQuery { limit?: number; afterId?: number; search?: string; categoryId?: number }
export class BackendCatalogError extends Error {
  constructor() { super('No fue posible cargar un catálogo válido desde la API.') }
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(k => !Object.hasOwn(value, k))) throw new BackendCatalogError()
  return value as Record<string, unknown>
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 4294967295) throw new BackendCatalogError()
  return value
}
function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string') throw new BackendCatalogError()
  return value
}
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new BackendCatalogError()
  return value
}
export function parseBackendProduct(value: unknown): BackendCatalogProduct {
  const p = object(value, ['id', 'internal_code', 'barcode', 'common_name', 'scientific_name', 'description', 'category_id',
    'price_cents', 'effective_price_cents', 'unit', 'is_active', 'watering_advice', 'light_type', 'recommended_climate', 'image', 'active_promotion'])
  id(p.id); id(p.category_id)
  for (const key of ['internal_code', 'common_name', 'description', 'unit', 'watering_advice', 'light_type', 'recommended_climate']) text(p[key])
  text(p.barcode, true); text(p.scientific_name, true)
  if (p.is_active !== true || !['pieza', 'maceta', 'charola', 'bolsa', 'kg'].includes(String(p.unit))
    || money(p.effective_price_cents) > money(p.price_cents)) throw new BackendCatalogError()
  if (p.image !== null) {
    const image = object(p.image, ['id', 'url', 'alt_text'])
    if (image.url !== `/api/v1/images/${id(image.id)}`) throw new BackendCatalogError()
    text(image.alt_text, true)
  }
  if (p.active_promotion !== null) {
    const promotion = object(p.active_promotion, ['id', 'name', 'discount_percent'])
    id(promotion.id); text(promotion.name)
    if (typeof promotion.discount_percent !== 'number' || !Number.isFinite(promotion.discount_percent)
      || promotion.discount_percent < 0 || promotion.discount_percent > 100 || p.effective_price_cents === p.price_cents) throw new BackendCatalogError()
  } else if (p.effective_price_cents !== p.price_cents) throw new BackendCatalogError()
  return p as unknown as BackendCatalogProduct
}
function category(value: unknown): BackendCatalogCategory {
  const c = object(value, ['id', 'name', 'description', 'is_active'])
  id(c.id); text(c.name); text(c.description)
  if (c.is_active !== true) throw new BackendCatalogError()
  return c as unknown as BackendCatalogCategory
}
function page<T extends { id: number }>(value: unknown, parse: (v: unknown) => T, limit: number, after: number): BackendCatalogPage<T> {
  const p = object(value, ['items', 'next_after_id'])
  if (!Array.isArray(p.items) || p.items.length > limit) throw new BackendCatalogError()
  const items = p.items.map(parse)
  if (items.some((item, i) => item.id <= (i ? items[i - 1].id : after))) throw new BackendCatalogError()
  if (p.next_after_id !== null && (id(p.next_after_id) !== items.at(-1)?.id || items.length !== limit)) throw new BackendCatalogError()
  return { items, next_after_id: p.next_after_id as number | null }
}
export function createBackendCatalogService(request: typeof fetch = fetch) {
  async function load<T extends { id: number }>(resource: string, parse: (v: unknown) => T, query: BackendCatalogQuery, signal?: AbortSignal) {
    const limit = id(query.limit ?? 24), after = query.afterId === undefined ? 0 : id(query.afterId)
    if (limit > 100) throw new BackendCatalogError()
    const params = new URLSearchParams({ limit: String(limit) })
    if (after) params.set('after_id', String(after))
    if (query.categoryId !== undefined) params.set('category_id', String(id(query.categoryId)))
    if (query.search !== undefined) {
      if (typeof query.search !== 'string' || query.search.trim().length > 80
        || [...query.search].some(c => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159))) throw new BackendCatalogError()
      params.set('search', query.search.trim())
    }
    const timeout = AbortSignal.timeout(8000)
    const response = await request(`/api/v1/${resource}?${params}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'omit', redirect: 'error', cache: 'no-store' })
    if (!response.ok) throw new BackendCatalogError()
    let data: unknown
    try { data = await response.json() } catch { throw new BackendCatalogError() }
    return page(data, parse, limit, after)
  }
  return {
    products: (query: BackendCatalogQuery = {}, signal?: AbortSignal) => load('products', parseBackendProduct, query, signal),
    categories: (query: Pick<BackendCatalogQuery, 'limit' | 'afterId'> = {}, signal?: AbortSignal) => load('categories', category, query, signal),
  }
}
