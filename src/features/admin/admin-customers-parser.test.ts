import { describe, expect, it } from 'vitest'
import {
  parseCustomer,
  parseCustomers,
  parseUpsertCustomerResponse,
  validateCustomerName,
  validateCustomerEmail,
  validateCustomerPhone,
  AdminCustomersValidationError,
} from './admin-customers-parser'

const CUSTOMER_ID = 'ca000000-0000-0000-0000-000000000001'

describe('validación de nombre de cliente', () => {
  it('acepta nombres válidos entre 2 y 160 caracteres', () => {
    expect(validateCustomerName('Juan Pérez')).toBe('Juan Pérez')
    expect(validateCustomerName('A'.repeat(160))).toBe('A'.repeat(160))
  })

  it('rechaza nombres con espacios al inicio o al final', () => {
    expect(() => validateCustomerName(' Juan Pérez')).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerName('Juan Pérez ')).toThrow(AdminCustomersValidationError)
  })

  it('rechaza nombres demasiado cortos o largos', () => {
    expect(() => validateCustomerName('A')).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerName('A'.repeat(161))).toThrow(AdminCustomersValidationError)
  })

  it('rechaza valores que no son cadenas', () => {
    expect(() => validateCustomerName(123)).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerName(null)).toThrow(AdminCustomersValidationError)
  })
})

describe('validación de correo de cliente', () => {
  it('acepta correos válidos y los normaliza a minúsculas', () => {
    expect(validateCustomerEmail('test@example.com')).toBe('test@example.com')
    expect(validateCustomerEmail('TEST@EXAMPLE.COM')).toBe('test@example.com')
    expect(validateCustomerEmail('')).toBeNull()
    expect(validateCustomerEmail(null)).toBeNull()
    expect(validateCustomerEmail(undefined)).toBeNull()
  })

  it('rechaza correos con formato inválido o demasiado largos', () => {
    expect(() => validateCustomerEmail('not-an-email')).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerEmail('a@b')).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerEmail('a'.repeat(250) + '@example.com')).toThrow(AdminCustomersValidationError)
  })
})

describe('validación de teléfono de cliente', () => {
  it('acepta números válidos entre 8 y 20 caracteres', () => {
    expect(validateCustomerPhone('12345678')).toBe('12345678')
    expect(validateCustomerPhone('+52 1234 567890')).toBe('+52 1234 567890')
    expect(validateCustomerPhone('')).toBeNull()
    expect(validateCustomerPhone(null)).toBeNull()
  })

  it('rechaza teléfonos demasiado cortos o largos', () => {
    expect(() => validateCustomerPhone('1234567')).toThrow(AdminCustomersValidationError)
    expect(() => validateCustomerPhone('1'.repeat(21))).toThrow(AdminCustomersValidationError)
  })
})

describe('parseCustomer', () => {
  const validRawCustomer = {
    id: CUSTOMER_ID,
    fullName: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '5512345678',
  }

  it('acepta respuestas contractuales de búsqueda válidas', () => {
    const parsed = parseCustomer(validRawCustomer)
    expect(parsed).toEqual({
      id: CUSTOMER_ID,
      fullName: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '5512345678',
    })
  })

  it('acepta email y teléfono nulos', () => {
    const parsed = parseCustomer({
      ...validRawCustomer,
      email: null,
      phone: null,
    })
    expect(parsed.email).toBeNull()
    expect(parsed.phone).toBeNull()
  })

  it('rechaza si contiene campos adicionales', () => {
    expect(() => parseCustomer({
      ...validRawCustomer,
      extra_field: 'unknown',
    })).toThrow(AdminCustomersValidationError)
  })

  it('rechaza si falta algún campo o tiene tipos incorrectos', () => {
    const incomplete = { ...validRawCustomer }
    const incompleteCat: Partial<typeof validRawCustomer> = incomplete
    delete incompleteCat.fullName
    expect(() => parseCustomer(incompleteCat)).toThrow(AdminCustomersValidationError)
  })

  it('rechaza UUIDs inválidos', () => {
    expect(() => parseCustomer({
      ...validRawCustomer,
      id: 'not-a-uuid',
    })).toThrow(AdminCustomersValidationError)
  })
})

describe('parseUpsertCustomerResponse', () => {
  const validRawUpsertResponse = {
    id: CUSTOMER_ID,
    full_name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '5512345678',
    is_active: true,
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  }

  it('acepta la respuesta completa del backend', () => {
    const parsed = parseUpsertCustomerResponse(validRawUpsertResponse)
    expect(parsed).toEqual({
      id: CUSTOMER_ID,
      fullName: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '5512345678',
      isActive: true,
      createdAt: '2026-08-29T10:00:00Z',
      updatedAt: '2026-08-29T10:00:00Z',
    })
  })

  it('rechaza campos adicionales', () => {
    expect(() => parseUpsertCustomerResponse({
      ...validRawUpsertResponse,
      extra_field: 'unknown',
    })).toThrow(AdminCustomersValidationError)
  })
})

describe('parseCustomers', () => {
  it('acepta una lista vacía o con clientes válidos', () => {
    expect(parseCustomers([])).toEqual([])
    expect(parseCustomers([{
      id: CUSTOMER_ID,
      fullName: 'Juan Pérez',
      email: null,
      phone: null,
    }])).toHaveLength(1)
  })

  it('rechaza si no recibe una lista', () => {
    expect(() => parseCustomers({})).toThrow(AdminCustomersValidationError)
  })
})
