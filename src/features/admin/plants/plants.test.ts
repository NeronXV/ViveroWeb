import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { draftFromPlant, filterCatalogingDrafts, filterPlants, nextPendingPlant, plantPatch, preserveEditedDraft } from './plants-model'
import { emptyCatalogingFields, type CatalogingDraft } from './cataloging-service'
import { fetchPlantPhoto, fetchPlantPreparation, parsePreparation, patchPlant, type PlantPreparation } from './plants-service'
import type { AdminProduct } from '../admin-catalog-types'
import { bindBackendSession } from '../../auth/backend-runtime'
import { fetchAdminProducts, uploadProductImage } from '../admin-catalog-service'

const product: AdminProduct = { id: '1', internalCode: 'FL-001', barcode: '12345', commonName: 'Monstera', scientificName: 'Monstera deliciosa',
  description: '', categoryId: '1', categoryName: 'Follaje', priceCents: 12550, wholesalePriceCents: null, minimumStock: 2,
  unit: 'pieza', wateringAdvice: '', lightType: '', recommendedClimate: '', isActive: false, createdAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:00:00Z' }
const rawState = { schema_version: 1, product_id: 1, branch_id: 2, commercial_state: 'IMPORTED_PENDING', preparation_mode: 'PENDING',
  legacy_compatibility: false, ready: false, price_confirmed: true, initial_count_confirmed: false, activated: false, reasons: ['INITIAL_COUNT_PENDING', 'ACTIVATION_PENDING'] }
const prep = parsePreparation(rawState, '1', '2')
const catalogingDraft = (id: number, status: CatalogingDraft['status'] = 'DRAFT'): CatalogingDraft => ({
  id: String(id), original_name: `Planta de ensayo ${id}`, fields: emptyCatalogingFields(), status,
  revision: 1, product_id: null, has_image: false, updated_by: 1, updated_at: '2026-10-17T12:00:00Z', source_evidence: null,
})
it('lists every pending draft together with incomplete products, excluding published drafts and disabled products', () => {
  const filters = { search: '', category: '', pending: true, low: false }
  const drafts = Array.from({ length: 177 }, (_, i) => catalogingDraft(i + 1, i % 2 ? 'REVIEW' : 'DRAFT'))
  drafts.push(catalogingDraft(178, 'PREPARED'), catalogingDraft(179, 'LINKED'))
  const products = [product, { ...product, id: '2' }, { ...product, id: '3' }]
  const preparations = { '1': prep, '2': { ...prep, commercialState: 'DISABLED' as const }, '3': { ...prep, commercialState: 'READY' as const, ready: true } }
  expect(filterCatalogingDrafts(drafts, filters)).toHaveLength(177)
  expect(filterCatalogingDrafts(drafts, filters).length + filterPlants(products, preparations, [], filters).length).toBe(178)
  expect(filterCatalogingDrafts(drafts, filters).at(-1)?.id).toBe('177')
})
it('searches pending drafts by original or approved name, code and presentation with optional category', () => {
  const draft = catalogingDraft(1)
  draft.fields = { ...draft.fields, approved_name: 'Flor de ensayo', presentation: 'Bolsa 2L', internal_code: 'ENS-001', category_id: 2 }
  const filters = { search: '', category: '', pending: true, low: false }
  for (const search of ['PLANTA DE ENSAYO', 'flor', 'ens-001', 'bolsa']) {
    expect(filterCatalogingDrafts([draft], { ...filters, search })).toEqual([draft])
  }
  expect(filterCatalogingDrafts([draft], { ...filters, category: '2' })).toEqual([draft])
  expect(filterCatalogingDrafts([draft], { ...filters, category: '3' })).toEqual([])
  expect(filterCatalogingDrafts([draft], { ...filters, search: 'inexistente' })).toEqual([])
  expect(filterCatalogingDrafts([draft], { ...filters, low: true })).toEqual([])
})
const request = vi.fn()
beforeEach(() => {
  request.mockReset(); vi.stubGlobal('fetch', request)
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 4, expiresAt: Date.now() + 60000 }, accessStatus: 'ready',
    context: { user: { id: 4 }, branch: { id: 2, is_active: true } } } as never))
})
afterEach(() => vi.unstubAllGlobals())
it('preserves identity and does not submit unchanged activation, price or stock', () => {
  const draft = { ...draftFromPlant(product), watering_advice: 'Riego moderado' }
  expect(plantPatch(product, draft, true)).toEqual({ watering_advice: 'Riego moderado' })
})
it('uses exact cents, explicit price confirmation and ignores price edits without capacity', () => {
  const draft = { ...draftFromPlant(product), price: '200.15' }
  expect(plantPatch(product, draft, true)).toEqual({ price_cents: 20015 })
  expect(plantPatch(product, draft, false)).toEqual({})
  expect(plantPatch(product, draftFromPlant(product), true, true)).toEqual({ price_cents: 12550 })
})
it('keeps only actual draft edits when checking a failed save against newer server fields', () => {
  const draft = { ...draftFromPlant(product), watering_advice: 'Riego revisado' }
  const newer = { ...product, priceCents: 25000, lightType: 'Sol', image: { id: '10', url: '/api/v1/images/10', altText: '' } }
  const preserved = preserveEditedDraft(product, newer, draft)
  expect(preserved.price).toBe('250.00')
  expect(preserved.light_type).toBe('Sol')
  expect(plantPatch(newer, preserved, true)).toEqual({ watering_advice: 'Riego revisado' })
})
it('keeps a missing price missing while allowing botany to be saved', () => {
  const zero = { ...product, priceCents: 0 }
  expect(draftFromPlant(zero).price).toBe('')
  expect(plantPatch(zero, { ...draftFromPlant(zero), light_type: 'Sombra' }, true)).toEqual({ light_type: 'Sombra' })
  expect(() => plantPatch(product, { ...draftFromPlant(product), price: '0' }, true)).toThrow()
  expect(() => plantPatch(product, { ...draftFromPlant(product), price: '1.234' }, true)).toThrow()
})
it('filters names, scientific names, codes, category, pending state and branch low stock', () => {
  const plants = [product, { ...product, id: '2', commonName: 'Olivo', scientificName: null, categoryId: '2', internalCode: 'AR-002', barcode: null }]
  const preparations = { '1': prep, '2': { ...prep, productId: '2', commercialState: 'READY', ready: true } as PlantPreparation }
  const balances = [{ productId: '1', isLowStock: true } as never]
  const defaults = { search: '', category: '', low: false, pending: false }
  for (const search of ['fl-001', 'deliciosa', '12345']) expect(filterPlants(plants, preparations, [], { ...defaults, search })).toEqual([product])
  expect(filterPlants(plants, preparations, balances, { ...defaults, category: '1', pending: true, low: true })).toEqual([product])
  expect(filterPlants(plants, preparations, [], { ...defaults, low: true })).toEqual([])
})
it('keeps stable next pending sequence and ends without wrapping or creating products', () => {
  const preparations = { '1': prep, '2': { ...prep, ready: true, commercialState: 'READY' } as PlantPreparation, '3': { ...prep, productId: '3' } }
  expect(nextPendingPlant(['1', '2', '3'], '1', preparations)).toBe('3')
  expect(nextPendingPlant(['1', '2', '3'], '3', preparations)).toBeNull()
})
it('rejects preparations from another product/branch and unknown ready states', () => {
  expect(() => parsePreparation(rawState, '2', '2')).toThrow()
  expect(() => parsePreparation(rawState, '1', '9')).toThrow()
  expect(() => parsePreparation({ ...rawState, ready: true }, '1', '2')).toThrow()
  expect(() => parsePreparation({ ...rawState, reasons: ['GUESS'] }, '1', '2')).toThrow()
})
it('calls the existing preparation route with expected identity headers', async () => {
  request.mockResolvedValue(Response.json(rawState))
  expect(await fetchPlantPreparation('1', '2')).toEqual(prep)
  expect(request.mock.calls[0][0]).toBe('/api/v1/products/1/preparation')
  expect(request.mock.calls[0][1].headers['X-Expected-Branch-Id']).toBe('2')
})
it('does not automatically retry a failed product PATCH', async () => {
  request.mockRejectedValue(new Error('offline'))
  await expect(patchPlant('1', { common_name: 'Monstera revisada' })).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ common_name: 'Monstera revisada' })
})
it('fetches private inactive photographs through the authenticated existing route', async () => {
  request.mockResolvedValue(new Response(new Blob(['webp'], { type: 'image/webp' }), { headers: { 'Content-Type': 'image/webp' } }))
  expect((await fetchPlantPhoto('6', new AbortController().signal)).size).toBe(4)
  expect(request.mock.calls[0][0]).toBe('/api/v1/images/6?status=all')
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer ' + 'a'.repeat(43))
})
it('rejects incompatible photographs and invalid files before upload', async () => {
  request.mockResolvedValue(new Response('bad', { headers: { 'Content-Type': 'text/html' } }))
  await expect(fetchPlantPhoto('6', new AbortController().signal)).rejects.toThrow()
  request.mockReset()
  await expect(uploadProductImage('1', new Blob(['svg'], { type: 'image/svg+xml' }))).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})
it('keeps validated primary image metadata including inactive products', async () => {
  const time = '2026-10-10T10:00:00Z'
  request.mockImplementation(async (url: string) => Response.json({ items: url.includes('/categories?') ? [{ id: 1, name: 'Follaje', description: '', is_active: true, created_at: time, updated_at: time }] : [{
    id: 1, internal_code: 'FL-001', barcode: null, common_name: 'Monstera', scientific_name: null, description: '', category_id: 1, price_cents: 0,
    wholesale_price_cents: null, unit: 'pieza', minimum_stock: '0.000', watering_advice: '', light_type: '', recommended_climate: '', is_active: false,
    created_at: time, updated_at: time, image: { id: 6, url: '/api/v1/images/6', alt_text: 'Monstera' }, effective_price_cents: 0, active_promotion: null,
  }], next_after_id: null }))
  expect((await fetchAdminProducts({}))[0]).toMatchObject({ isActive: false, image: { id: '6', url: '/api/v1/images/6', altText: 'Monstera' } })
})
