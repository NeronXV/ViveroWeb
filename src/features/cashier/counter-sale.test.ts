import { describe, expect, it } from 'vitest'
import { addCounterProduct, prepareCounterSale, parseSubmission, parseCreatedSale, parseCounterProduct } from './counter-sale'
const user = '10000000-0000-4000-8000-000000000001', branch = '20000000-0000-4000-8000-000000000001'
const saleId = 'abcd1234-0000-4000-8000-000000000001'
const product = { id: '30000000-0000-4000-8000-000000000001', code: 'PL-001', name: 'Planta', priceCents: 12500 }
const request = () => prepareCounterSale([{ product, quantity: 2 }], user, branch, null, saleId, new Date('2026-09-09T12:00:00Z'))
const result = () => ({ id: saleId, idempotency_key: saleId, created_by: user, branch_id: branch, folio: request().folio, status: 'SENT_TO_CASHIER', total_cents: 24000 })
describe('venta de mostrador', () => {
 it('envía identificadores y cantidades sin imponer precios ni sucursal al servidor', () => {
  expect(request().items).toEqual([{ product_id: product.id, quantity: 2 }])
  expect(request().folio).toBe('VD-260909-ABCD12')
  expect(request().customerId).toBeNull()
 })
 it('agrupa escaneos repetidos en una partida', () => expect(addCounterProduct([{ product, quantity: 2 }], product)).toEqual([{ product, quantity: 3 }]))
 it.each([0, -1, 1.5, 100001, NaN])('rechaza cantidad inválida %s', quantity => expect(() => prepareCounterSale([{ product, quantity }], user, branch, null, saleId)).toThrow())
 it('rechaza partidas duplicadas', () => expect(() => prepareCounterSale([{ product, quantity: 1 }, { product, quantity: 1 }], user, branch, null, saleId)).toThrow())
 it('recupera el folio original aunque cambie el día', () => expect(parseSubmission(request(), user, branch)).toEqual(request()))
 it('no recupera el intento de otra sucursal', () => expect(() => parseSubmission(request(), user, user)).toThrow())
 it('no recupera cantidades guardadas con tipo incompatible', () => expect(() => parseSubmission({ ...request(), items: [{ product_id: product.id, quantity: '2' }] }, user, branch)).toThrow())
 it('acepta el total definitivo del servidor aunque cambie la estimación', () => expect(parseCreatedSale(result(), request()).totalCents).toBe(24000))
 it.each(['id', 'branch_id', 'created_by', 'folio', 'idempotency_key'])('rechaza una respuesta de otra venta: %s', field => expect(() => parseCreatedSale({ ...result(), [field]: 'incorrecto' }, request())).toThrow())
 it('tolera recuperar una venta ya pagada sin crear otra', () => expect(parseCreatedSale({ ...result(), status: 'PAID' }, request()).status).toBe('PAID'))
 it('usa el precio efectivo de la consulta de código', () => expect(parseCounterProduct({ schemaVersion: 1, item: { product: { id: product.id, internal_code: product.code, common_name: product.name, is_active: true }, pricing: { productId: product.id, effectivePriceCents: 12000 } } })?.priceCents).toBe(12000))
 it('reconoce un código inexistente', () => expect(parseCounterProduct({ schemaVersion: 1, item: null })).toBeNull())
})
