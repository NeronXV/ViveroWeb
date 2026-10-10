import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../auth/backend-runtime'
import type { BackendSessionState } from '../auth/backend-session'
import { decideCountObservation, fetchInventoryPermissions, parseObservation, pendingInventoryPreparation, recordInventoryCountObservation, recoverInventoryPreparation } from './inventory-preparation-service'

const state: BackendSessionState = { session: { accessToken: 'a'.repeat(43), expiresAt: Date.now() + 60000, userId: 1 }, status: 'authenticated', accessStatus: 'ready', busy: false, error: null,
  context: { schema_version: 1, user: { id: 1, email: 'synthetic@example.invalid', full_name: 'Sintetico' }, access_state: 'ACTIVE', role: { id: 1, name: 'MANAGER', display_name: 'Gerencia' },
    branch: { id: 2, code: 'TEST', name: 'Sucursal sintetica', is_active: true }, capabilities: ['MANAGE_INVENTORY'] } }
const receipt = { schema_version: 1, observation_id: 7, product_id: 3, branch_id: 2, observed_quantity: '4.000', baseline_quantity: '2.000', status: 'PENDING', reason: 'Conteo sintetico' }
const input = { productId: '3', countedQuantity: 4, reason: 'Conteo sintetico', baseline: { productId: '3', branchId: '2', quantity: '2.000', movementId: 4 } }
const saved = new Map<string, string>()
const fetcher = vi.fn<typeof fetch>()
let unbind: () => void
beforeEach(() => {
  saved.clear(); fetcher.mockReset(); unbind = bindBackendSession(() => state)
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) })
})
afterEach(() => { unbind(); vi.unstubAllGlobals() })
it('uses permissions authorized by the server, even for a manager account', async () => {
  fetcher.mockResolvedValue(Response.json({ schema_version: 1, branch_id: 2, permissions: { can_record_count: true, can_receive: false, can_approve_counts: false } }))
  expect(await fetchInventoryPermissions()).toEqual({ canRecordCount: true, canReceive: false, canApproveCounts: false })
})
it('rejects malformed contracts and quantities before making a request', () => {
  expect(() => parseObservation({ ...receipt, status: 'PAID' })).toThrow()
  expect(() => recordInventoryCountObservation({ ...input, countedQuantity: -1 })).toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
it('persists before POST and resolves a lost response without repeating the mutation', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('network'))
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  const pending = pendingInventoryPreparation()!
  expect(pending.body).toEqual({ product_id: 3, counted_quantity: '4', reason: 'Conteo sintetico', baseline_quantity: '2.000', baseline_movement_id: 4 })
  fetcher.mockResolvedValueOnce(Response.json(receipt))
  expect((await recoverInventoryPreparation()).id).toBe('7')
  expect(fetcher.mock.calls[1][0]).toBe('/api/v1/inventory/count-observations/result')
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': pending.key })
  expect(pendingInventoryPreparation()).toBeNull()
})
it('retries the same key only after an explicit not-found result', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('network'))
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  const key = pendingInventoryPreparation()!.key
  fetcher.mockResolvedValueOnce(Response.json({ error: 'INVENTORY_OPERATION_NOT_FOUND' }, { status: 404 })).mockResolvedValueOnce(Response.json(receipt))
  await recoverInventoryPreparation()
  expect(fetcher.mock.calls[2][1]?.headers).toMatchObject({ 'Idempotency-Key': key })
})
it('blocks a different operation while the first result is uncertain, including after service reload', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('network'))
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  await expect(recordInventoryCountObservation({ ...input, countedQuantity: 8 })).rejects.toThrow('Comprueba primero')
  await expect(decideCountObservation('7', 'APPROVE', 'Revision sintetica')).rejects.toThrow('Comprueba primero')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('retains the attempt if reading the result also loses its connection', async () => {
  fetcher.mockRejectedValue(new TypeError('network'))
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  const key = pendingInventoryPreparation()!.key
  await expect(recoverInventoryPreparation()).rejects.toThrow()
  expect(pendingInventoryPreparation()!.key).toBe(key)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('replays the same approval key and preserves the safe message for stale counts', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('network'))
  await expect(decideCountObservation('7', 'APPROVE', 'Revision sintetica')).rejects.toThrow()
  const key = pendingInventoryPreparation()!.key
  fetcher.mockResolvedValueOnce(Response.json({ ...receipt, status: 'APPLIED' }))
  await recoverInventoryPreparation()
  expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': key })
  fetcher.mockResolvedValueOnce(Response.json({ error: 'INVENTORY_COUNT_STALE' }, { status: 409 }))
  await expect(decideCountObservation('8', 'APPROVE', 'Revision sintetica')).rejects.toThrow('Hubo movimientos')
  expect(pendingInventoryPreparation()).toBeNull()
})
it('does not send if the journal cannot be stored', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Storage unavailable') } })
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
it('does not expose another account or branch pending operations', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('network'))
  await expect(recordInventoryCountObservation(input)).rejects.toThrow()
  unbind(); unbind = bindBackendSession(() => ({ ...state, context: { ...state.context!, branch: { ...state.context!.branch!, id: 9 } } }))
  expect(pendingInventoryPreparation()).toBeNull()
  expect(saved.size).toBe(1)
})
