import { expect, it } from 'vitest'
import { isBackendSaleFolio, isBackendOrderFolio } from './folio-format'
it('accepts legacy and canonical persisted aliases, including expansion beyond 9999', () => {
  for (const value of ['VD-0001', 'VD-9999', 'VD-10000', 'VD-' + 'A'.repeat(24)]) expect(isBackendSaleFolio(value)).toBe(true)
  for (const value of ['VD-0000', 'VD-1', 'VD-00001', 'VD-9007199254740992', 'VW-0001', 'VD-ABCD']) expect(isBackendSaleFolio(value)).toBe(false)
  expect(isBackendOrderFolio('VW-0001', 1)).toBe(true)
  expect(isBackendOrderFolio('VW-1', 1)).toBe(true)
  expect(isBackendOrderFolio('VW-10000', 10000)).toBe(true)
  expect(isBackendOrderFolio('VW-0002', 1)).toBe(false)
})
