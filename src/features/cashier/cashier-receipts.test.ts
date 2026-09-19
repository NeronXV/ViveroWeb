import { describe, expect, it } from 'vitest'
import { createPaymentAttempt } from './cashier-payment-state'
import { readReceiptReferences, receiptStorageKey, rememberReceipt } from './cashier-receipts'

const user = '10000000-0000-0000-0000-000000000001'
const sale = '20000000-0000-0000-0000-000000000001'
const key = '30000000-0000-0000-0000-000000000001'

describe('referencias para reimpresión', () => {
  it('no guarda intentos inciertos ni ventas sin confirmación', () => {
    const attempt = createPaymentAttempt(user, sale, key)
    expect(rememberReceipt([], attempt)).toEqual([])
    expect(rememberReceipt([], { ...attempt, status: 'UNCERTAIN' })).toEqual([])
    expect(rememberReceipt([], { ...attempt, status: 'SUCCEEDED' })).toEqual([])
  })

  it('conserva una referencia por venta sin datos de tarjeta, importes ni claims', () => {
    const attempt = createPaymentAttempt(user, sale, key)
    const paid = { ...attempt, status: 'SUCCEEDED' as const, paymentResult: {
      schemaVersion: 1 as const, status: 'SUCCEEDED' as const, serverTime: '2026-09-18T12:00:00Z',
      sale: { id: sale, folio: 'VD-TEST', totalCents: 100, createdAt: '2026-09-18T12:00:00Z', createdByLabel: null },
    } }
    const rows = rememberReceipt([], paid)
    expect(rememberReceipt(rows, paid)).toEqual([{ saleId: sale, idempotencyKey: key, folio: 'VD-TEST' }])
    expect(readReceiptReferences(JSON.stringify(rows))).toEqual(rows)
    expect(rememberReceipt(rows, { ...paid, saleId: user })).toEqual(rows)
    expect(rememberReceipt(Array.from({ length: 100 }, (_, i) => ({ saleId: String(i), idempotencyKey: key, folio: 'old' })), paid)).toHaveLength(100)
  })

  it('separa usuarios y sucursales y rechaza almacenamiento inválido', () => {
    expect(receiptStorageKey(user, sale)).not.toBe(receiptStorageKey(sale, user))
    expect(receiptStorageKey(user, sale)).not.toBe(receiptStorageKey(user, key))
    expect(readReceiptReferences(null)).toEqual([])
    for (const value of ['invalid', '{}', '[null]', '[{"saleId":"bad"}]']) {
      expect(() => readReceiptReferences(value)).toThrow()
    }
  })
})
