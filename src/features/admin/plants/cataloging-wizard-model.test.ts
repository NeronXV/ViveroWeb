import { describe, expect, it } from 'vitest'
import {
  describePublicationResult,
  initialWizardForm,
  parseWizardPrice,
  parseWizardQuantity,
  validateStep1,
} from './cataloging-wizard-model'

describe('cataloging-wizard-model', () => {
  it('populates initial wizard form with fallback to originalName', () => {
    const form = initialWizardForm(
      {
        approved_name: '',
        presentation: 'M15',
        category_id: 3,
        internal_code: 'SKU-001',
        scientific_name: 'Ficus elastica',
        barcode: '123456789',
        description: 'Planta de interior',
      },
      'Goma en maceta'
    )
    expect(form.approved_name).toBe('Goma en maceta')
    expect(form.presentation).toBe('M15')
    expect(form.category_id).toBe(3)
    expect(form.internal_code).toBe('SKU-001')
  })

  it('validates Step 1 required fields correctly', () => {
    expect(
      validateStep1({
        approved_name: 'Ficus',
        presentation: 'Maceta 6',
        category_id: 1,
        internal_code: '',
        scientific_name: '',
        barcode: '',
        description: '',
      }).valid
    ).toBe(true)

    const invalid = validateStep1({
      approved_name: '',
      presentation: '',
      category_id: null,
      internal_code: '',
      scientific_name: '',
      barcode: '',
      description: '',
    })
    expect(invalid.valid).toBe(false)
    expect(invalid.errors.length).toBe(3)
  })

  it('parses valid and invalid price inputs', () => {
    expect(parseWizardPrice('')).toBeNull()
    expect(parseWizardPrice('150')).toBe(15000)
    expect(parseWizardPrice('25.50')).toBe(2550)
    expect(() => parseWizardPrice('0')).toThrow()
    expect(() => parseWizardPrice('-10')).toThrow()
    expect(() => parseWizardPrice('abc')).toThrow()
  })

  it('parses valid and invalid quantity inputs', () => {
    expect(parseWizardQuantity('')).toBeNull()
    expect(parseWizardQuantity('10')).toBe(10)
    expect(parseWizardQuantity('0')).toBe(0)
    expect(() => parseWizardQuantity('-5')).toThrow()
    expect(() => parseWizardQuantity('10.5')).toThrow()
  })

  it('describes publication results correctly based on price and stock presence', () => {
    const ready = describePublicationResult(15000, 5)
    expect(ready.statusType).toBe('ready')
    expect(ready.headline).toContain('lista para la venta')
    const serverPending = describePublicationResult(15000, 5, false)
    expect(serverPending.statusType).toBe('pending')
    expect(serverPending.details).toContain('servidor')

    const pendingBoth = describePublicationResult(null, null)
    expect(pendingBoth.statusType).toBe('pending')
    expect(pendingBoth.details).toContain('precio confirmado y existencias físicas')

    const pendingStock = describePublicationResult(15000, null)
    expect(pendingStock.statusType).toBe('pending')
    expect(pendingStock.details).toContain('existencias físicas')

    const pendingPrice = describePublicationResult(null, 5)
    expect(pendingPrice.statusType).toBe('pending')
    expect(pendingPrice.details).toContain('precio confirmado')
  })
})
