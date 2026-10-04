import { describe, expect, it, vi } from 'vitest'
import { createBackendSessionController } from './backend-session'
const token = 'A'.repeat(43)
const context = { schema_version: 1, user: { id: 1, email: 'demo@example.invalid', full_name: 'Demo' }, access_state: 'ACTIVE', role: { id: 1, name: 'OWNER', display_name: 'Dueño' }, branch: { id: 2, code: 'DEMO', name: 'Demo', is_active: true }, capabilities: ['OPERATE_CASHIER'] }
const login = () => Response.json({ token_type: 'Bearer', access_token: token, expires_in: 3600 })
const logout = () => Response.json({ signed_out: true })
describe('backend session lifecycle', () => {
  it('keeps integer identity and opaque token in memory, preserving the password', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context))
    const controller = createBackendSessionController(fetcher, () => 1000)
    expect(await controller.signIn(' demo@example.invalid ', ' password ')).toBe(true)
    expect(controller.getSnapshot().session).toEqual({ accessToken: token, userId: 1, expiresAt: 3601000 })
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).password).toBe(' password ')
    expect(controller.getSnapshot().accessStatus).toBe('ready')
  })
  it('drops permissions immediately during refresh and fails closed on network errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
    const controller = createBackendSessionController(fetcher)
    await controller.signIn('demo@example.invalid', 'demo')
    const pending = controller.refresh()
    expect(controller.getSnapshot().context).toBeNull()
    await pending
    expect(controller.getSnapshot()).toMatchObject({ status: 'authenticated', accessStatus: 'error', context: null })
    expect(controller.getSnapshot().session).not.toBeNull()
  })
  it('expires without making another request and clears the token', async () => {
    let time = 1000
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context))
    const controller = createBackendSessionController(fetcher, () => time)
    await controller.signIn('demo@example.invalid', 'demo')
    time = 3601000; controller.expire()
    expect(controller.getSnapshot()).toMatchObject({ status: 'anonymous', context: null, session: null })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('clears a revoked session on 401 and rejects a changed identity', async () => {
    for (const response of [Response.json({}, { status: 401 }), Response.json({ ...context, user: { ...context.user, id: 9 } })]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(response)
      const controller = createBackendSessionController(fetcher)
      await controller.signIn('demo@example.invalid', 'demo')
      expect(await controller.refresh()).toBe(false)
      expect(controller.getSnapshot().context).toBeNull()
    }
  })
  it('never restores access after logout even if an old refresh arrives late', async () => {
    let complete!: (value: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context)).mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValueOnce(logout())
    const controller = createBackendSessionController(fetcher)
    await controller.signIn('demo@example.invalid', 'demo')
    const pending = controller.refresh(), signedOut = controller.signOut()
    expect(controller.getSnapshot().session).toBeNull()
    complete(Response.json(context)); await pending; await signedOut
    expect(controller.getSnapshot().status).toBe('anonymous')
  })
  it('suppresses duplicate login and revokes a late successful login after cancellation', async () => {
    let complete!: (value: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValueOnce(logout())
    const controller = createBackendSessionController(fetcher)
    const pending = controller.signIn('demo@example.invalid', 'demo')
    expect(await controller.signIn('demo@example.invalid', 'demo')).toBe(false)
    await controller.signOut(); complete(login())
    expect(await pending).toBe(false)
    expect(controller.getSnapshot().session).toBeNull()
    expect(fetcher.mock.calls[1][0]).toBe('/api/v1/auth/logout')
  })
  it('keeps logout locally effective even when remote revocation fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json(context)).mockRejectedValueOnce(new TypeError('offline'))
    const controller = createBackendSessionController(fetcher)
    await controller.signIn('demo@example.invalid', 'demo')
    expect(await controller.signOut()).toBe(false)
    expect(controller.getSnapshot().session).toBeNull()
  })
})

it('revokes an authenticated token when context fails and never grants partial access', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(logout())
  const controller = createBackendSessionController(fetcher)
  expect(await controller.signIn('demo@example.invalid', 'demo')).toBe(false)
  expect(controller.getSnapshot()).toMatchObject({ session: null, context: null, busy: false, status: 'anonymous' })
  expect(fetcher.mock.calls[2][0]).toBe('/api/v1/auth/logout')
})
it('does not grant access when a delayed login exceeds its conservative lifetime', async () => {
  let time = 0
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(login()).mockImplementationOnce(async () => { time = 3600000; return Response.json(context) }).mockResolvedValueOnce(logout())
  const controller = createBackendSessionController(fetcher, () => time)
  expect(await controller.signIn('demo@example.invalid', 'demo')).toBe(false)
  expect(controller.getSnapshot()).toMatchObject({ session: null, context: null, busy: false, status: 'anonymous' })
})
