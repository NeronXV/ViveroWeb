import { describe, expect, it } from 'vitest'
import { cents, parseClosing, parseClosingPreview } from './cashier-operations-service'
describe('closing contracts', () => {
 it('preserves a negative cash difference', () => expect(parseClosing({ id: 'c1', createdAt: '2026-09-08T00:00:00Z', expectedCashCents: 15000, countedCashCents: 14000, differenceCents: -1000 }).differenceCents).toBe(-1000))
 it.each([1.1, Number.MAX_SAFE_INTEGER + 1, '100', null, NaN])('rejects an invalid monetary value %s', value => expect(() => cents(value)).toThrow())
 it('parses an empty first shift', () => expect(parseClosingPreview({ payments: { cash: 0, card: 0, transfer: 0, count: 0 }, refunds: { cash: 0, other: 0, count: 0 }, lastClosing: null }).lastClosing).toBeNull())
 it('rejects incomplete totals instead of assuming zero', () => expect(() => parseClosingPreview({ payments: { cash: 0 }, refunds: {}, lastClosing: null })).toThrow())
})
