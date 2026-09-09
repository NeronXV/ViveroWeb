import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { prepareCounterSale, counterStorageKey } from './counter-sale'
import { readCounterPending, submitCounterSale, finishCounterSale, CounterRejected } from './counter-sale-service'
const { rpc, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }))
vi.mock('../../lib/supabase/client', () => ({ getSupabaseClient: () => ({ rpc }) }))
const user = '10000000-0000-4000-8000-000000000001', branch = '20000000-0000-4000-8000-000000000001'
const product = { id: '30000000-0000-4000-8000-000000000001', name: 'Ejemplo', code: 'P-1', priceCents: 15000 }
const request = () => prepareCounterSale([{ product, quantity: 1 }], user, branch, null, 'abcd1234-0000-4000-8000-000000000001')
let storage: Map<string, string>
beforeEach(() => {
 storage = new Map(); vi.clearAllMocks()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
 vi.stubGlobal('navigator', { locks: { request: (_key: string, run: () => unknown) => run() } })
 rpc.mockReturnValue({ abortSignal })
})
afterEach(() => vi.unstubAllGlobals())
describe('envío recuperable', () => {
 it('guarda antes de llamar a la red y conserva el intento ante timeout', async () => {
  abortSignal.mockImplementation(async () => { expect(readCounterPending(user, branch)).toEqual(request()); throw new Error('timeout') })
  await expect(submitCounterSale(request())).rejects.toThrow('timeout')
  expect(readCounterPending(user, branch)).toEqual(request())
 })
 it('reintenta con el mismo identificador y payload después de recargar', async () => {
  abortSignal.mockResolvedValue({ data: null, error: { code: '500' } })
  await expect(submitCounterSale(request())).rejects.toThrow()
  await expect(submitCounterSale(readCounterPending(user, branch)!)).rejects.toThrow()
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
  expect(rpc.mock.calls[0][1]).toEqual({ p_sale_id: request().id, p_folio: request().folio, p_items: request().items, p_customer_id: null })
 })
 it('bloquea un carrito distinto si hay un intento guardado', async () => {
  storage.set(counterStorageKey(user, branch), JSON.stringify(request()))
  await expect(submitCounterSale({ ...request(), id: 'abcd1234-0000-4000-8000-000000000002' })).rejects.toThrow('otro intento')
  expect(rpc).not.toHaveBeenCalled()
 })
 it('no envía si no puede guardar la recuperación', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('storage blocked') } })
  await expect(submitCounterSale(request())).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalled()
 })
 it('un rechazo de validación permite corregir el carrito', async () => {
  abortSignal.mockResolvedValue({ data: null, error: { code: '22023' } })
  await expect(submitCounterSale(request())).rejects.toBeInstanceOf(CounterRejected)
  expect(readCounterPending(user, branch)).toBeNull()
 })
 it('retiene la recuperación si la respuesta es incompatible', async () => {
  abortSignal.mockResolvedValue({ data: {}, error: null })
  await expect(submitCounterSale(request())).rejects.toThrow()
  expect(readCounterPending(user, branch)).toEqual(request())
 })
 it('solo elimina la recuperación de la venta confirmada', () => {
  storage.set(counterStorageKey(user, branch), JSON.stringify(request()))
  finishCounterSale({ ...request(), id: 'abcd1234-0000-4000-8000-000000000002' })
  expect(readCounterPending(user, branch)).not.toBeNull()
  finishCounterSale(request()); expect(readCounterPending(user, branch)).toBeNull()
 })
})
