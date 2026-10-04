import { beforeEach, expect, it, vi } from 'vitest'
import { searchCustomers, upsertCustomer } from './admin-customers-service'
import { bindBackendSession } from '../auth/backend-runtime'
const fetchMock = vi.fn()
const customer = { id: 8, full_name: 'Persona demo', email: 'demo@example.invalid', phone: null, is_active: true, created_at: '2026-10-01T12:00:00.000000Z', updated_at: '2026-10-01T12:00:00.000000Z' }
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset()
  bindBackendSession(() => ({ session: { accessToken: 'demo', userId: 1, expiresAt: Date.now() + 60000 }, context: { user: { id: 1 } }, accessStatus: 'ready' } as never))
})
it('searches the API with encoded literal input and validates integer IDs', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ schema_version: 1, items: [customer] })))
  expect(await searchCustomers('  de%mo  ', 25)).toEqual([{ id: '8', fullName: 'Persona demo', email: 'demo@example.invalid', phone: null }])
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/v1/customers?search=de%25mo&limit=25')
  expect(init.headers.Authorization).toBe('Bearer demo')
  expect(init.credentials).toBe('omit')
})
it('updates only an integer customer and sends the official body', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ schema_version: 1, customer })))
  expect((await upsertCustomer({ id: '8', fullName: 'Persona demo', email: 'DEMO@example.invalid', phone: null, isActive: true })).id).toBe('8')
  expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/customers/8')
  expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ full_name: 'Persona demo', email: 'demo@example.invalid', phone: null, is_active: true })
  expect(() => upsertCustomer({ id: '11111111-1111-4111-8111-111111111111', fullName: 'Persona demo', email: null, phone: null, isActive: true })).toThrow()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('rejects malformed responses and hides database details without fallback', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ schema_version: 1, items: [{ ...customer, id: '8' }] })))
  await expect(searchCustomers('demo')).rejects.toMatchObject({ code: 'INCOMPATIBLE_RESPONSE' })
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'REQUEST_FAILED', detail: 'private database detail' }), { status: 503 }))
  await expect(searchCustomers('demo')).rejects.toMatchObject({ code: 'REQUEST_FAILED', message: 'No fue posible completar la operación de clientes en el servidor.' })
})
it('blocks expired sessions before making a request', async () => {
  bindBackendSession(() => ({ session: { accessToken: 'demo', userId: 1, expiresAt: 0 }, accessStatus: 'ready' } as never))
  await expect(searchCustomers('demo')).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})
