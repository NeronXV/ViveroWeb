import { describe, expect, it, vi } from 'vitest'
import { directoryCount, backendAdminRequest } from './backend-admin-request'
import { parseAdminBranchesResponse } from './admin-parser'
import { backendHttp } from '../../lib/backend-http'
vi.mock('../../lib/backend-http', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/backend-http')>(), backendHttp: vi.fn() }))
describe('MariaDB branch directory counts', () => {
  it.each([0, 3, '0', '3', String(Number.MAX_SAFE_INTEGER)])('accepts the exact safe count %s', value => {
    expect(directoryCount(value)).toBe(Number(value))
  })
  it.each([null, undefined, '', ' ', '1.0', '1e2', '-1', '01', '3x', true, -1, 1.5, Infinity, '9007199254740992'])('rejects invalid count %s without a zero fallback', value => {
    expect(() => directoryCount(value)).toThrow()
  })
  it('parses the serialized API directory and rejects corruption in either counter', async () => {
    const row = { id: 1, code: 'DEMO', name: 'Sucursal sintética', is_active: true, updated_at: '2026-10-10T12:00:00Z', active_staff_count: '3', pending_sale_count: '1' }
    vi.mocked(backendHttp).mockResolvedValue({ items: [row], next_after_id: null })
    const parsed = parseAdminBranchesResponse(await backendAdminRequest('get_admin_branches', {}))
    expect(parsed.items[0]).toMatchObject({ activeStaffCount: 3, pendingSaleCount: 1 })
    for (const field of ['active_staff_count', 'pending_sale_count']) {
      vi.mocked(backendHttp).mockResolvedValue({ items: [{ ...row, [field]: null }], next_after_id: null })
      await expect(backendAdminRequest('get_admin_branches', {})).rejects.toThrow()
    }
  })
})
