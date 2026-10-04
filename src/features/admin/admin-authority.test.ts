import { beforeEach, expect, it, vi } from 'vitest'
import { createBranch } from './admin-service'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), api: vi.fn() }))
vi.mock('./backend-admin-request', () => ({ backendAdminRequest: mocks.api }))
vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }))
const branch = { id: '2', code: 'DEMO', name: 'Demo sucursal', is_active: true, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z' }
beforeEach(() => { mocks.rpc.mockReset(); mocks.api.mockReset() })
it('uses only the official API for administrative operations', async () => {
  mocks.api.mockResolvedValueOnce(branch)
  await expect(createBranch({ code: 'DEMO', name: 'Demo sucursal' })).resolves.toMatchObject({ id: '2' })
  expect(mocks.api).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('never falls back to Supabase when the API rejects the session or permissions', async () => {
  mocks.api.mockRejectedValueOnce(new Error('session unavailable'))
  await expect(createBranch({ code: 'DEMO', name: 'Demo sucursal' })).rejects.toThrow()
  expect(mocks.api).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
