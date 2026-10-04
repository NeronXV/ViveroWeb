import { expect, it, vi } from 'vitest'
import { BackendCatalogError, createBackendCatalogService, parseBackendProduct } from './backend-catalog-service'

const product = { id: 1, internal_code: 'DEMO', barcode: null, common_name: 'Demo', scientific_name: null,
  description: '', category_id: 2, price_cents: 100, effective_price_cents: 100, unit: 'pieza', is_active: true,
  watering_advice: '', light_type: '', recommended_climate: '', image: null, active_promotion: null }
const response = (items: unknown[], next: number | null = null) => new Response(JSON.stringify({ items, next_after_id: next }))

it('preserves server cents and permits rounded percentage zero without recalculating price', () => {
  expect(parseBackendProduct(product)).toEqual(product)
  expect(parseBackendProduct({ ...product, effective_price_cents: 99, active_promotion: { id: 3, name: 'Demo', discount_percent: 0 } }).effective_price_cents).toBe(99)
})
it('rejects legacy IDs, inactive products, invalid money and unsafe image origins', () => {
  for (const change of [{ id: 'uuid' }, { category_id: 0 }, { is_active: false }, { extra: true },
    { price_cents: 1.1 }, { price_cents: Number.MAX_SAFE_INTEGER + 1 }, { effective_price_cents: 101 },
    { effective_price_cents: 99 }, { image: { id: 1, url: 'https://other.example.invalid/1', alt_text: null } }]) {
    expect(() => parseBackendProduct({ ...product, ...change })).toThrow(BackendCatalogError)
  }
  expect(parseBackendProduct({ ...product, image: { id: 1, url: '/api/v1/images/1', alt_text: null } }).image?.url).toBe('/api/v1/images/1')
})
it('encodes search/category and paginates by integer ID without cookies or fallback', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response([product], 1)).mockResolvedValueOnce(response([{ ...product, id: 2 }]))
  const service = createBackendCatalogService(request)
  expect((await service.products({ search: ' Demo & planta ', categoryId: 2, limit: 1 })).next_after_id).toBe(1)
  expect(request.mock.calls[0][0]).toBe('/api/v1/products?limit=1&category_id=2&search=Demo+%26+planta')
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
  expect((await service.products({ afterId: 1, limit: 1 })).items[0].id).toBe(2)
})
it('rejects invalid cursors, duplicate rows and unbounded filters', async () => {
  for (const result of [{ items: [product], next_after_id: 2 }, { items: [product, product], next_after_id: null }, { items: [], next_after_id: 1 }]) {
    await expect(createBackendCatalogService(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result)))).products()).rejects.toThrow(BackendCatalogError)
  }
  const request = vi.fn<typeof fetch>()
  const service = createBackendCatalogService(request)
  for (const query of [{ limit: 101 }, { afterId: 0 }, { search: 'a'.repeat(81) }, { categoryId: 1.1 }]) await expect(service.products(query)).rejects.toThrow(BackendCatalogError)
  expect(request).not.toHaveBeenCalled()
})
it('loads active categories separately and propagates cancellation without retries', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response([{ id: 2, name: 'Demo', description: '', is_active: true }]))
  const service = createBackendCatalogService(request)
  expect((await service.categories()).items[0].id).toBe(2)
  const controller = new AbortController()
  controller.abort()
  const error = new DOMException('Aborted', 'AbortError')
  request.mockRejectedValueOnce(error)
  await expect(service.products({}, controller.signal)).rejects.toBe(error)
  expect((request.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true)
  request.mockResolvedValueOnce(new Response('internal details', { status: 503 }))
  await expect(service.products()).rejects.toThrow(BackendCatalogError)
  expect(request).toHaveBeenCalledTimes(3)
})
