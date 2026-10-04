import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { fetchAdminCategories, fetchAdminProducts, upsertCategory } from './admin-catalog-service'
import { upsertCatalogPromotion } from './admin-promotions-service'
import { bindBackendSession } from '../auth/backend-runtime'
const request = vi.fn(), time = '2026-10-01T12:00:00.000000Z'
const category = { id: 1, name: 'Plantas', description: '', is_active: true, created_at: time, updated_at: time }
beforeEach(() => {
  request.mockReset(); vi.stubGlobal('fetch', request)
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 4, expiresAt: Date.now() + 60000 }, accessStatus: 'ready', context: { user: { id: 4 }, branch: { id: 1, is_active: true } } } as never))
})
afterEach(() => vi.unstubAllGlobals())
it('reads categories including inactive metadata from the authenticated API', async () => {
  request.mockResolvedValueOnce(Response.json({ items: [category], next_after_id: null }))
  expect((await fetchAdminCategories())[0]).toMatchObject({ id: '1', description: null, isActive: true })
  expect(request.mock.calls[0][0]).toBe('/api/v1/categories?limit=100&status=all')
  expect(request.mock.calls[0][1].credentials).toBe('omit')
})
it('keeps branch minimum, prices and category from the actual response', async () => {
  request.mockImplementation(async (url: string) => Response.json({ items: url.includes('/categories?') ? [category] : [{ id: 2, internal_code: 'DEMO', barcode: null, common_name: 'Demo', scientific_name: null, description: '', category_id: 1, price_cents: 100, wholesale_price_cents: null, unit: 'pieza', minimum_stock: '2.500', watering_advice: '', light_type: '', recommended_climate: '', is_active: true, created_at: time, updated_at: time, image: null, effective_price_cents: 100, active_promotion: null }], next_after_id: null }))
  expect((await fetchAdminProducts({}))[0]).toMatchObject({ id: '2', minimumStock: 2.5, priceCents: 100, categoryName: 'Plantas' })
})
it('combines caller cancellation with the transport deadline and stops a canceled load', async () => {
  const controller = new AbortController()
  request.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))))
  const loading = fetchAdminCategories(controller.signal)
  expect(request.mock.calls[0][1].signal).not.toBe(controller.signal)
  controller.abort()
  await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
})
it('creates an inactive category atomically and reads back the stored result', async () => {
  request.mockResolvedValueOnce(Response.json({ id: 1 })).mockResolvedValueOnce(Response.json({ items: [{ ...category, is_active: false }], next_after_id: null }))
  expect((await upsertCategory({ name: 'Plantas', description: null, isActive: false })).isActive).toBe(false)
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ name: 'Plantas', description: '', is_active: false })
})
it('converts percentage to exact integer basis points and rejects fractional cents', async () => {
  request.mockResolvedValue(Response.json({ id: 9 }))
  const value = { name: 'Demo', scope: 'ALL_PRODUCTS' as const, promoType: 'PERCENTAGE' as const, value: 1.15, isActive: true, productIds: [] }
  await upsertCatalogPromotion(value)
  expect(JSON.parse(request.mock.calls[0][1].body).percentage_bps).toBe(115)
  await expect(upsertCatalogPromotion({ ...value, value: 1.151 })).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})
