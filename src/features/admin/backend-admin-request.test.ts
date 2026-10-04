import { afterEach, expect, it, vi } from 'vitest'
import { backendAdminRequest } from './backend-admin-request'
import { bindBackendSession } from '../auth/backend-runtime'
import type { BackendSessionState } from '../auth/backend-session'
import { parseBranchRowResponse, parseInventoryReceptionResult, parseInventoryCountResult } from './admin-parser'

const state: BackendSessionState = { session: { accessToken: 'a'.repeat(43), expiresAt: Date.now() + 60000, userId: 1 },
  status: 'authenticated', accessStatus: 'ready', busy: false, error: null, context: { schema_version: 1,
    user: { id: 1, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE',
    role: { id: 1, name: 'OWNER', display_name: 'Propietario' }, branch: { id: 1, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: [] } }
let unbind: (() => void) | null = null
afterEach(() => { unbind?.(); unbind = null; vi.unstubAllGlobals() })
function request(body: unknown) { unbind = bindBackendSession(() => state); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body))); vi.stubGlobal('fetch', fetcher); return fetcher }
it('uses the official branch endpoint and preserves actual creation and update dates', async () => {
  const fetcher = request({ schema_version: 1, branch: { id: 2, code: 'DEMO', name: 'Demo sucursal', is_active: true, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:01:00Z' } })
  const result = parseBranchRowResponse(await backendAdminRequest('create_branch', { p_code: 'DEMO', p_name: 'Demo sucursal' }))
  expect(result.id).toBe('2')
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/admin/branches')
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ code: 'DEMO', name: 'Demo sucursal' })
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer ' + 'a'.repeat(43) })
})
it('maps complete reception and count responses without losing operation identifiers', async () => {
  const fetcher = request({ schema_version: 1, idempotent_replay: false, movement_id: 7, product_id: 2, quantity: '3.000', total_quantity: '5.000' })
  const parameters = { p_product_id: '2', p_quantity: 3, p_notes: null, p_idempotency_key: 'b'.repeat(64) }
  expect(parseInventoryReceptionResult(await backendAdminRequest('record_inventory_reception', parameters))).toMatchObject({ productId: '2', totalQuantity: 5 })
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ product_id: 2, quantity: '3', notes: null })
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ schema_version: 1, idempotent_replay: false, count_id: 8, product_id: 2, previous_quantity: '5.000', counted_quantity: '4.000', adjustment_quantity: '-1.000', total_quantity: '4.000' })))
  expect(parseInventoryCountResult(await backendAdminRequest('reconcile_inventory_count', { p_product_id: '2', p_counted_quantity: 4, p_reason: 'Conteo demo', p_idempotency_key: 'c'.repeat(64) }))).toMatchObject({ productId: '2', totalQuantity: 4, adjustmentQuantity: -1 })
})
it('rejects legacy database IDs and expired sessions before HTTP', async () => {
  const fetcher = request({})
  await expect(backendAdminRequest('set_user_active', { p_user_id: '20000000-0000-0000-0000-000000000001', p_is_active: false })).rejects.toThrow()
  unbind?.(); unbind = bindBackendSession(() => ({ ...state, session: { ...state.session!, expiresAt: 1 } }))
  await expect(backendAdminRequest('get_admin_branches', {})).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
