import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../../auth/backend-runtime'
import { createSupplierPurchaseDraft, recoverSupplierPurchaseDraft, retireSupplierPurchaseDraft, fetchSupplierPurchases, resolveSupplierPurchaseItem, fetchSuppliers } from './purchases-service'
const http = vi.fn(), saved = new Map<string, string>()
const time = '2026-10-01T12:00:00.000Z'
const purchase = { id: 8, branch_id: 1, supplier: { id: 2, name: 'Demo', code: 'DEMO' }, document_date: '2026-10-01', external_reference: null, payment_terms: 'CASH', expected_total_cents: 100,
  created_at: time, received_at: null, item_count: 1, unmatched_count: 1, source_file_name: null, status: 'DRAFT',
  items: [{ id: 9, line_number: 1, raw_description: 'Demo planta', supplier_container_code: 'M1', supplier_presentation: 'Maceta', suggested_common_name: null, suggested_presentation: null, quantity: 1, unit_cost_cents: 100, line_total_cents: 100, product_id: null, resolution_status: 'UNMATCHED' }] }
const input = { supplierId: '2', documentDate: '2026-10-01', externalReference: null, paymentTerms: 'CASH' as const, expectedTotalCents: 100, sourceFileName: null, idempotencyKey: 'draft-demo-attempt-0001',
  items: [{ lineNumber: 1, rawDescription: 'Demo planta', containerCode: 'M1', suggestedCommonName: null, suggestedPresentation: null, quantity: 1, unitCostCents: 100 }] }
beforeEach(() => {
  http.mockReset(); saved.clear(); vi.stubGlobal('fetch', http)
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) })
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, action: () => unknown) => action() } })
  bindBackendSession(() => ({ session: { accessToken: 'a'.repeat(43), userId: 4, expiresAt: Date.now() + 60000 }, accessStatus: 'ready', context: { user: { id: 4 }, branch: { id: 1, is_active: true } } } as never))
})
afterEach(() => vi.unstubAllGlobals())
it('persists original draft before POST and recovers the same body/key after lost response', async () => {
  http.mockImplementationOnce(async () => { expect(saved.size).toBe(1); throw new Error('lost') })
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  const sent = http.mock.calls[0][1]
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, purchase }))
  const result = await recoverSupplierPurchaseDraft()
  expect(http.mock.calls[1][1].body).toBe(sent.body)
  expect(http.mock.calls[1][1].headers['Idempotency-Key']).toBe(input.idempotencyKey)
  expect(result).toMatchObject({ id: '8', branchId: '1', itemCount: 1, unmatchedCount: 1, createdAt: time })
  expect(result?.items[0]).toMatchObject({ id: '9', containerCode: 'M1', supplierPresentation: 'Maceta' })
  expect(saved.size).toBe(0)
})
it('blocks another draft and retains its original data after a server rejection', async () => {
  http.mockResolvedValueOnce(Response.json({ error: 'SUPPLIER_UNAVAILABLE' }, { status: 409 }))
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  await expect(createSupplierPurchaseDraft({ ...input, expectedTotalCents: 200 })).rejects.toMatchObject({ code: 'PENDING_PURCHASE' })
  expect(http).toHaveBeenCalledTimes(1); expect(saved.size).toBe(1)
})
it('fences a rejected key before releasing the slot and archives all original source data', async () => {
  http.mockResolvedValueOnce(Response.json({ error: 'SUPPLIER_UNAVAILABLE' }, { status: 409 }))
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  const original = [...saved.values()][0]
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'RETIRED', receipt: null }))
  expect(await retireSupplierPurchaseDraft()).toBeNull()
  expect(http.mock.calls[1][0]).toBe('/api/v1/supplier-purchases/retire')
  expect(http.mock.calls[1][1].headers['Idempotency-Key']).toBe(input.idempotencyKey)
  expect([...saved.values()]).toEqual([original])
  expect([...saved.keys()][0]).toContain(':retired:')
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, purchase }))
  await createSupplierPurchaseDraft({ ...input, idempotencyKey: 'corrected-draft-attempt-0002' })
  expect(http.mock.calls[2][1].headers['Idempotency-Key']).toBe('corrected-draft-attempt-0002')
})
it('keeps the pending key after lost retirement responses or incompatible replies', async () => {
  http.mockRejectedValueOnce(new Error('lost draft'))
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  const before = [...saved.entries()]
  http.mockRejectedValueOnce(new Error('lost retirement'))
  await expect(retireSupplierPurchaseDraft()).rejects.toThrow()
  expect([...saved.entries()]).toEqual(before)
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'UNKNOWN', receipt: null }))
  await expect(retireSupplierPurchaseDraft()).rejects.toThrow()
  expect([...saved.entries()]).toEqual(before)
})
it('recovers a committed draft instead of allowing a replacement', async () => {
  http.mockRejectedValueOnce(new Error('lost response'))
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'COMMITTED', receipt: { schema_version: 1, purchase } }))
  expect(await retireSupplierPurchaseDraft()).toMatchObject({ id: '8' })
  expect(saved.size).toBe(0)
})
it('keeps the original pending draft if its archive cannot be saved', async () => {
  http.mockRejectedValueOnce(new Error('lost response'))
  await expect(createSupplierPurchaseDraft(input)).rejects.toThrow()
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { if (!key.includes(':retired:')) saved.set(key, value) }, removeItem: (key: string) => saved.delete(key) })
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, status: 'RETIRED', receipt: null }))
  await expect(retireSupplierPurchaseDraft()).rejects.toMatchObject({ code: 'STORAGE_FAILED' })
  expect(saved.size).toBe(1)
})
it('uses authoritative list counts, dates and supplier rather than synthesizing metadata', async () => {
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, branch_id: 1, items: [purchase], next_after_id: null }))
  expect((await fetchSupplierPurchases()).items[0]).toMatchObject({ createdAt: time, unmatchedCount: 1, supplier: { id: '2', name: 'Demo' } })
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, branch_id: 1, items: [{ ...purchase, created_at: undefined }], next_after_id: null }))
  await expect(fetchSupplierPurchases()).rejects.toThrow()
})
it('resolves only a nested purchase item and loads suppliers without skipping id one', async () => {
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, purchase }))
  await resolveSupplierPurchaseItem({ purchaseId: '8', itemId: '9', resolution: 'IGNORED', productId: null, normalizedName: null, presentation: null })
  expect(http.mock.calls[0][0]).toBe('/api/v1/supplier-purchases/8/items/9')
  http.mockResolvedValueOnce(Response.json({ schema_version: 1, items: [{ id: 1, name: 'Demo', code: 'DEMO' }], next_after_id: null }))
  expect((await fetchSuppliers())[0].id).toBe('1')
  expect(http.mock.calls[1][0]).toBe('/api/v1/suppliers?limit=100')
})
