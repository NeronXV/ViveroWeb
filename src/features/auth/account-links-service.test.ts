import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountRecovery, recoveryToken, inviteStaff } from './account-links-service'
import { backendHttp } from '../../lib/backend-http'

vi.mock('../../lib/backend-http', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/backend-http')>(), backendHttp: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('API recovery and invitation boundary', () => {
  it('accepts only the opaque fragment format, never Supabase sessions or query parameters', () => {
    expect(recoveryToken('#token=' + 'A'.repeat(43))).toBe('A'.repeat(43))
    for (const value of ['?token=' + 'A'.repeat(43), '#access_token=legacy', '#token=short', '#token=' + 'A'.repeat(43) + '&email=secret']) expect(recoveryToken(value)).toBeNull()
  })
  it('submits secrets only in JSON to the same origin without cookies or redirects', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ password_changed: true })))
    vi.stubGlobal('fetch', request)
    const body = { token: 'A'.repeat(43), password: '  Synthetic password 2026  ' }
    await accountRecovery('password', body)
    expect(request).toHaveBeenCalledWith('/api/v1/auth/password', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store', body: JSON.stringify(body) }))
  })
  it('does not treat errors or incompatible responses as success or expose provider details', async () => {
    for (const status of [400, 429, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'private-detail' }), { status })))
      await expect(accountRecovery('recovery', { email: 'demo@example.invalid' })).rejects.not.toThrow('private-detail')
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: false }))))
    await expect(accountRecovery('recovery', { email: 'demo@example.invalid' })).rejects.toThrow('No se confirmó')
  })
  it('invites through the existing authenticated API bridge and confirms the result', async () => {
    vi.mocked(backendHttp).mockResolvedValue({ invited: true })
    await inviteStaff('Demo', 'demo@example.invalid')
    expect(backendHttp).toHaveBeenCalledWith('admin/staff/invitations', 'POST', { name: 'Demo', email: 'demo@example.invalid' }, undefined)
    vi.mocked(backendHttp).mockResolvedValue({ invited: false })
    await expect(inviteStaff('Demo', 'demo@example.invalid')).rejects.toThrow()
  })
})
