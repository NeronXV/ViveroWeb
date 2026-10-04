import { describe, expect, it, vi } from 'vitest'
import { BackendAuthError, createBackendAuthService, parseBackendAccess } from './backend-auth-service'

const bearer = 'A'.repeat(43)
const context = {
  schema_version: 1, user: { id: 1, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE',
  role: { id: 2, name: 'CASHIER', display_name: 'Caja' },
  branch: { id: 3, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: ['OPERATE_CASHIER'],
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('Backend API identity boundary', () => {
  it('retains integer IDs, inactive branches and roleless contexts without granting extra capabilities', () => {
    expect(parseBackendAccess(context)).toEqual(context)
    expect(parseBackendAccess({ ...context, branch: { ...context.branch, is_active: false } }).branch?.is_active).toBe(false)
    expect(parseBackendAccess({ ...context, access_state: 'NO_ROLE', role: null, branch: null, capabilities: [] }).role).toBeNull()
  })
  it('rejects UUIDs, unknown versions, roles, fields and inconsistent access states', () => {
    for (const changed of [
      { schema_version: 2 }, { extra: true }, { user: { ...context.user, id: 'legacy-uuid' } },
      { role: { ...context.role, name: 'ROOT' } }, { access_state: 'ACTIVE', role: null },
      { access_state: 'NO_ROLE', role: null }, { capabilities: ['OPERATE_CASHIER', 'OPERATE_CASHIER'] },
      { branch: { ...context.branch, is_active: 1 } }, { capabilities: ['operate_cashier'] },
    ]) expect(() => parseBackendAccess({ ...context, ...changed })).toThrow(BackendAuthError)
  })
  it('uses same-origin API, opaque bearer and preserves passwords, with no cookies or redirects', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ token_type: 'Bearer', access_token: bearer, expires_in: 3600 }))
      .mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ signed_out: true }))
    const service = createBackendAuthService(request)
    const password = ' demo synthetic password '
    const session = await service.login('demo@example.invalid', password)
    expect(session.accessToken).toBe(bearer)
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).password).toBe(password)
    expect(request.mock.calls[0]).toEqual(['/api/v1/auth/login', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' })])
    expect(await service.context(bearer, 1)).toEqual(context)
    expect(request.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({ Authorization: `Bearer ${bearer}` }))
    await service.logout(bearer)
  })
  it('rejects mismatched identities and malformed successful responses', async () => {
    const service = createBackendAuthService(vi.fn<typeof fetch>().mockResolvedValue(response(context)))
    await expect(service.context(bearer, 2)).rejects.toThrow(BackendAuthError)
    await expect(service.context('invalid')).rejects.toThrow(BackendAuthError)
    await expect(service.login('demo@example.invalid', 'demo')).rejects.toThrow(BackendAuthError)
    await expect(service.logout(bearer)).rejects.toThrow(BackendAuthError)
  })
  it('hides server errors and never retries credentials or switches backend', async () => {
    for (const status of [401, 403, 429, 503]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(response({ error: 'internal secret detail' }, status))
      await expect(createBackendAuthService(request).login('demo@example.invalid', 'demo')).rejects.toMatchObject({ status })
      expect(request).toHaveBeenCalledTimes(1)
    }
  })
  it('passes cancellation through and preserves abort failures', async () => {
    const controller = new AbortController()
    const error = new DOMException('Aborted', 'AbortError')
    const request = vi.fn<typeof fetch>().mockRejectedValue(error)
    await expect(createBackendAuthService(request).context(bearer, undefined, controller.signal)).rejects.toBe(error)
    expect(request.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})
