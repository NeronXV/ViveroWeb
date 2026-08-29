import { describe, expect, it } from 'vitest'
import {
  parseAdminBranchesResponse,
  parseAdminStaffResponse,
  parseCreateBranchResponse,
  parseVoidResponse,
  validateAssignUserBranchInput,
  validateAssignUserRoleInput,
  validateCreateBranchInput,
  validateUpdateBranchInput,
  parseAdminDailySalesReport,
  parseAdminTopProductsReport,
} from './admin-parser'

const BRANCH_ID = '91000000-0000-0000-0000-000000000001'
const USER_ID = '92000000-0000-0000-0000-000000000001'
const PRODUCT_ID = '93000000-0000-0000-0000-000000000001'

function branchResponse(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    items: [{
      id: BRANCH_ID,
      code: 'CENTRO',
      name: 'Sucursal Centro',
      isActive: true,
      activeStaffCount: 3,
      pendingSaleCount: 1,
      updatedAt: '2026-08-29T10:00:00Z',
    }],
    page: { limit: 50, hasMore: false, nextCursor: null },
    serverTime: '2026-08-29T10:01:00Z',
  }
}

function staffResponse(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    items: [{
      id: USER_ID,
      fullName: 'Dulce Owner',
      isActive: true,
      branch: { id: BRANCH_ID, code: 'CENTRO', name: 'Sucursal Centro', isActive: true },
      role: { name: 'OWNER', displayName: 'Propietario' },
      updatedAt: '2026-08-29T10:00:00Z',
    }],
    page: { limit: 50, hasMore: false, nextCursor: null },
    serverTime: '2026-08-29T10:01:00Z',
  }
}

describe('contrato de sucursales administrativas', () => {
  it('acepta la respuesta V1 exacta', () => {
    const response = parseAdminBranchesResponse(branchResponse())
    expect(response.items[0]).toMatchObject({ id: BRANCH_ID, code: 'CENTRO', activeStaffCount: 3, pendingSaleCount: 1 })
  })

  it('rechaza versiones, campos y paginación desconocidos', () => {
    expect(() => parseAdminBranchesResponse({ ...branchResponse(), schemaVersion: 2 })).toThrow()
    expect(() => parseAdminBranchesResponse({ ...branchResponse(), email: 'private@test.invalid' })).toThrow()
    const invalid = branchResponse()
    invalid.page = { limit: 50, hasMore: true, nextCursor: null }
    expect(() => parseAdminBranchesResponse(invalid)).toThrow()
  })

  it('valida el cursor de código y UUID', () => {
    const value = branchResponse()
    value.page = { limit: 1, hasMore: true, nextCursor: { code: 'CENTRO', id: BRANCH_ID } }
    expect(parseAdminBranchesResponse(value).page.nextCursor).toEqual({ code: 'CENTRO', id: BRANCH_ID })
    ;(value.page as Record<string, unknown>).nextCursor = { code: 'centro', id: BRANCH_ID }
    expect(() => parseAdminBranchesResponse(value)).toThrow()
  })
})

describe('contrato de personal administrativo', () => {
  it('acepta personal, rol y sucursal sin datos de autenticación', () => {
    const response = parseAdminStaffResponse(staffResponse())
    expect(response.items[0].role?.name).toBe('OWNER')
    expect(response.items[0].branch?.id).toBe(BRANCH_ID)
    expect(response.items[0]).not.toHaveProperty('email')
  })

  it('rechaza correo, rol desconocido y fechas sin zona', () => {
    const email = staffResponse()
    ;(email.items as Record<string, unknown>[])[0].email = 'private@test.invalid'
    expect(() => parseAdminStaffResponse(email)).toThrow()

    const role = staffResponse()
    ;((role.items as Record<string, unknown>[])[0].role as Record<string, unknown>).name = 'SUPERADMIN'
    expect(() => parseAdminStaffResponse(role)).toThrow()

    const date = staffResponse()
    ;(date.items as Record<string, unknown>[])[0].updatedAt = '2026-08-29T10:00:00'
    expect(() => parseAdminStaffResponse(date)).toThrow()
  })

  it('acepta perfil sin rol ni sucursal y cursor estable', () => {
    const value = staffResponse()
    const item = (value.items as Record<string, unknown>[])[0]
    item.role = null
    item.branch = null
    value.page = { limit: 1, hasMore: true, nextCursor: { fullName: 'Dulce Owner', id: USER_ID } }
    const response = parseAdminStaffResponse(value)
    expect(response.items[0].role).toBeNull()
    expect(response.page.nextCursor?.id).toBe(USER_ID)
  })
})

describe('validadores y parsers de mutaciones administrativas', () => {
  describe('validateCreateBranchInput', () => {
    it('acepta entradas válidas', () => {
      const result = validateCreateBranchInput('SUR_01', 'Sucursal Sur')
      expect(result).toEqual({ code: 'SUR_01', name: 'Sucursal Sur' })
    })

    it('rechaza códigos con formato inválido', () => {
      expect(() => validateCreateBranchInput('sur_01', 'Sucursal Sur')).toThrow()
      expect(() => validateCreateBranchInput('SUR*', 'Sucursal Sur')).toThrow()
      expect(() => validateCreateBranchInput('', 'Sucursal Sur')).toThrow()
    })

    it('rechaza nombres inválidos', () => {
      expect(() => validateCreateBranchInput('SUR', '')).toThrow()
      expect(() => validateCreateBranchInput('SUR', ' ')).toThrow()
      expect(() => validateCreateBranchInput('SUR', 'A'.repeat(121))).toThrow()
    })
  })

  describe('validateUpdateBranchInput', () => {
    it('acepta entradas válidas', () => {
      const result = validateUpdateBranchInput(BRANCH_ID, 'SUR_02', 'Sucursal Sur Nueva')
      expect(result).toEqual({ id: BRANCH_ID, code: 'SUR_02', name: 'Sucursal Sur Nueva' })
    })

    it('rechaza IDs inválidos', () => {
      expect(() => validateUpdateBranchInput('not-a-uuid', 'SUR_02', 'Sucursal Sur Nueva')).toThrow()
    })
  })

  describe('validateAssignUserBranchInput', () => {
    it('acepta asignaciones y desasignaciones válidas', () => {
      const result = validateAssignUserBranchInput(USER_ID, BRANCH_ID)
      expect(result).toEqual({ userId: USER_ID, branchId: BRANCH_ID })

      const desasignar = validateAssignUserBranchInput(USER_ID, null)
      expect(desasignar).toEqual({ userId: USER_ID, branchId: null })

      const desasignarVacio = validateAssignUserBranchInput(USER_ID, '')
      expect(desasignarVacio).toEqual({ userId: USER_ID, branchId: null })
    })

    it('rechaza UUIDs inválidos', () => {
      expect(() => validateAssignUserBranchInput('not-a-uuid', BRANCH_ID)).toThrow()
      expect(() => validateAssignUserBranchInput(USER_ID, 'not-a-uuid')).toThrow()
    })
  })

  describe('validateAssignUserRoleInput', () => {
    it('acepta roles válidos', () => {
      const result = validateAssignUserRoleInput(USER_ID, 'CASHIER')
      expect(result).toEqual({ userId: USER_ID, role: 'CASHIER' })

      const quitarRol = validateAssignUserRoleInput(USER_ID, null)
      expect(quitarRol).toEqual({ userId: USER_ID, role: null })

      const quitarRolVacio = validateAssignUserRoleInput(USER_ID, '')
      expect(quitarRolVacio).toEqual({ userId: USER_ID, role: null })

      const quitarRolNone = validateAssignUserRoleInput(USER_ID, 'NONE')
      expect(quitarRolNone).toEqual({ userId: USER_ID, role: null })
    })

    it('rechaza roles desconocidos', () => {
      expect(() => validateAssignUserRoleInput(USER_ID, 'SUPERADMIN')).toThrow()
    })
  })

  describe('parseCreateBranchResponse', () => {
    it('acepta un UUID válido', () => {
      expect(parseCreateBranchResponse(BRANCH_ID)).toBe(BRANCH_ID)
    })

    it('rechaza valores que no son UUID', () => {
      expect(() => parseCreateBranchResponse('12345')).toThrow()
      expect(() => parseCreateBranchResponse(null)).toThrow()
    })
  })

  describe('parseVoidResponse', () => {
    it('acepta null y booleanos', () => {
      expect(parseVoidResponse(null)).toBeNull()
      expect(parseVoidResponse(true)).toBe(true)
      expect(parseVoidResponse(false)).toBe(false)
    })

    it('rechaza otros tipos de datos', () => {
      expect(() => parseVoidResponse('ok')).toThrow()
      expect(() => parseVoidResponse({})).toThrow()
    })
  })
})

describe('parsers de reportes administrativos reales', () => {
  describe('parseAdminDailySalesReport', () => {
    it('acepta un reporte de ventas diarias válido', () => {
      const payload = [
        {
          branchId: BRANCH_ID,
          branchName: 'Sucursal Centro',
          day: '2026-08-28T00:00:00Z',
          salesCount: 15,
          revenueCents: 150000,
          discountCents: 1500,
        },
      ]
      const result = parseAdminDailySalesReport(payload)
      expect(result).toHaveLength(1)
      expect(result[0].branchName).toBe('Sucursal Centro')
      expect(result[0].revenueCents).toBe(150000)
    })

    it('rechaza si no es un arreglo o faltan propiedades', () => {
      expect(() => parseAdminDailySalesReport({})).toThrow()
      expect(() => parseAdminDailySalesReport([
        {
          branchId: BRANCH_ID,
          day: '2026-08-28T00:00:00Z',
        },
      ])).toThrow()
    })
  })

  describe('parseAdminTopProductsReport', () => {
    it('acepta un reporte de productos más vendidos válido', () => {
      const payload = [
        {
          productId: PRODUCT_ID,
          productName: 'Monstera deliciosa',
          productCode: 'P-MON-01',
          totalQuantity: 25,
          totalRevenueCents: 250000,
        },
      ]
      const result = parseAdminTopProductsReport(payload)
      expect(result).toHaveLength(1)
      expect(result[0].productName).toBe('Monstera deliciosa')
      expect(result[0].totalQuantity).toBe(25)
    })

    it('rechaza si no es un arreglo o faltan propiedades', () => {
      expect(() => parseAdminTopProductsReport({})).toThrow()
      expect(() => parseAdminTopProductsReport([
        {
          productId: PRODUCT_ID,
          productName: 'Monstera deliciosa',
        },
      ])).toThrow()
    })
  })
})
