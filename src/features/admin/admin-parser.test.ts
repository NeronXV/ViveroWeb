import { describe, expect, it } from 'vitest'
import {
  parseAdminBranchesResponse,
  parseAdminStaffResponse,
  parseAdminRoleOptionsResponse,
  parseSetAdminStaffRoleResult,
  parseBranchRowResponse,
  parseVoidResponse,
  validateAssignUserBranchInput,
  validateAssignUserRoleInput,
  validateSetAdminStaffRoleInput,
  validateCreateBranchInput,
  validateUpdateBranchInput,
  parseAdminDailySalesReport,
  parseAdminTopProductsReport,
  parseAdminInventoryBalances,
  validateInventoryReceptionInput,
  validateInventoryCountInput,
  parseInventoryReceptionResult,
  parseInventoryCountResult,
  parseInventoryHistory,
} from './admin-parser'

const BRANCH_ID = '91000000-0000-0000-0000-000000000001'
const USER_ID = '92000000-0000-0000-0000-000000000001'
const PRODUCT_ID = '93000000-0000-0000-0000-000000000001'
const OPERATION_ID = '93000000-0000-4000-8000-000000000002'

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
    it('acepta asignaciones válidas y rechaza null y vacío', () => {
      const result = validateAssignUserBranchInput(USER_ID, BRANCH_ID)
      expect(result).toEqual({ userId: USER_ID, branchId: BRANCH_ID })

      expect(() => validateAssignUserBranchInput(USER_ID, null)).toThrow()
      expect(() => validateAssignUserBranchInput(USER_ID, '')).toThrow()
    })

    it('rechaza UUIDs inválidos', () => {
      expect(() => validateAssignUserBranchInput('not-a-uuid', BRANCH_ID)).toThrow()
      expect(() => validateAssignUserBranchInput(USER_ID, 'not-a-uuid')).toThrow()
    })
  })

  describe('validateAssignUserRoleInput', () => {
    it('acepta roles válidos y rechaza null, vacío y NONE', () => {
      const result = validateAssignUserRoleInput(USER_ID, 'CASHIER')
      expect(result).toEqual({ userId: USER_ID, role: 'CASHIER' })

      expect(() => validateAssignUserRoleInput(USER_ID, null)).toThrow()
      expect(() => validateAssignUserRoleInput(USER_ID, '')).toThrow()
      expect(() => validateAssignUserRoleInput(USER_ID, 'NONE')).toThrow()
    })

    it('rechaza roles desconocidos', () => {
      expect(() => validateAssignUserRoleInput(USER_ID, 'SUPERADMIN')).toThrow()
    })
  })

  describe('parseBranchRowResponse', () => {
    it('acepta una fila completa de public.branches', () => {
      const row = {
        id: BRANCH_ID,
        code: 'CENTRO',
        name: 'Sucursal Centro',
        is_active: true,
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      const result = parseBranchRowResponse(row)
      expect(result.id).toBe(BRANCH_ID)
      expect(result.code).toBe('CENTRO')
      expect(result.isActive).toBe(true)
      expect(result.createdAt).toBe('2026-01-15T10:00:00Z')
    })

    it('rechaza valores escalares y formas incompletas', () => {
      expect(() => parseBranchRowResponse(BRANCH_ID)).toThrow()
      expect(() => parseBranchRowResponse(null)).toThrow()
      expect(() => parseBranchRowResponse({ id: BRANCH_ID })).toThrow()
    })
  })

  describe('parseVoidResponse', () => {
    it('acepta únicamente la respuesta vacía del backend', () => {
      expect(parseVoidResponse(null)).toBeNull()
      expect(() => parseVoidResponse(true)).toThrow()
      expect(() => parseVoidResponse(false)).toThrow()
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

describe('contrato de inventario administrativo real', () => {
  const payload = {
    schemaVersion: 1,
    branchId: BRANCH_ID,
    items: [{
      productId: PRODUCT_ID,
      productName: 'Planta de prueba',
      productCode: 'TEST-01',
      productUnit: 'pieza',
      totalQuantity: 12,
      minimumStock: 3,
      isLowStock: false,
      balanceUpdatedAt: '2026-08-29T10:00:00Z',
    }],
    hasMore: false,
    nextProductId: null,
  }

  it('acepta saldos V1 coherentes de una sola sucursal', () => {
    expect(parseAdminInventoryBalances(payload).items[0]).toMatchObject({ productId: PRODUCT_ID, totalQuantity: 12 })
  })

  it('acepta productos sin saldo y rechaza campos desconocidos o paginación incoherente', () => {
    expect(parseAdminInventoryBalances({
      ...payload,
      items: [{ ...payload.items[0], totalQuantity: 0, isLowStock: true, balanceUpdatedAt: null }],
    }).items[0].balanceUpdatedAt).toBeNull()
    expect(() => parseAdminInventoryBalances({ ...payload, privateData: true })).toThrow()
    expect(() => parseAdminInventoryBalances({ ...payload, items: [{ ...payload.items[0], isLowStock: true }] })).toThrow()
    expect(() => parseAdminInventoryBalances({ ...payload, hasMore: true, nextProductId: null })).toThrow()
  })

  it('valida una recepción entera y normaliza sus notas', () => {
    expect(validateInventoryReceptionInput(PRODUCT_ID, 5, '  Entrada inicial  ', OPERATION_ID)).toEqual({
      productId: PRODUCT_ID, quantity: 5, notes: 'Entrada inicial', idempotencyKey: OPERATION_ID,
    })
    expect(() => validateInventoryReceptionInput(PRODUCT_ID, 1.5, '', OPERATION_ID)).toThrow()
    expect(() => validateInventoryReceptionInput(PRODUCT_ID, 0, '', OPERATION_ID)).toThrow()
  })

  it('valida conteos físicos y motivos obligatorios', () => {
    expect(validateInventoryCountInput(PRODUCT_ID, 8, '  Conteo de cierre  ', OPERATION_ID)).toEqual({
      productId: PRODUCT_ID, countedQuantity: 8, reason: 'Conteo de cierre', idempotencyKey: OPERATION_ID,
    })
    expect(() => validateInventoryCountInput(PRODUCT_ID, -1, 'Conteo', OPERATION_ID)).toThrow()
    expect(() => validateInventoryCountInput(PRODUCT_ID, 8, 'x', OPERATION_ID)).toThrow()
  })

  it('acepta resultados estrictos de recepción y conciliación', () => {
    expect(parseInventoryReceptionResult({
      schemaVersion: 1,
      idempotentReplay: false,
      movementId: OPERATION_ID,
      productId: PRODUCT_ID,
      quantity: 5,
      totalQuantity: 15,
    }).totalQuantity).toBe(15)
    expect(parseInventoryCountResult({
      schemaVersion: 1,
      idempotentReplay: false,
      countId: OPERATION_ID,
      productId: PRODUCT_ID,
      previousQuantity: 15,
      countedQuantity: 13,
      adjustmentQuantity: -2,
      totalQuantity: 13,
    }).adjustmentQuantity).toBe(-2)
  })

  it('acepta historial V1 sin tratar la etiqueta actual como dato inmutable', () => {
    const parsed = parseInventoryHistory({
      schemaVersion: 1,
      branchId: BRANCH_ID,
      items: [{
        id: OPERATION_ID,
        productId: PRODUCT_ID,
        productName: 'Planta de prueba',
        productCode: 'TEST-01',
        movementType: 'ADJUSTMENT_SUB',
        quantity: -2,
        notes: 'Conteo de cierre',
        createdAt: '2026-08-29T10:00:00Z',
        createdByLabel: 'Gerente actual',
      }],
      hasMore: false,
      nextCursor: null,
    })
    expect(parsed.items[0]).toMatchObject({ quantity: -2, createdByLabel: 'Gerente actual' })
  })

  it('rechaza historial sin cursor cuando anuncia más resultados', () => {
    expect(() => parseInventoryHistory({
      schemaVersion: 1, branchId: BRANCH_ID, items: [], hasMore: true, nextCursor: null,
    })).toThrow()
  })
})

describe('contrato de opciones de rol autorizadas (get_admin_role_options)', () => {
  const adminOptionsPayload = {
    schemaVersion: 1,
    actorRole: 'ADMIN',
    items: [
      { name: 'SALES', displayName: 'Vendedor', capabilities: ['SELL_PRODUCTS', 'VIEW_CATALOG'] },
      { name: 'CASHIER', displayName: 'Cajero', capabilities: ['PROCESS_PAYMENTS', 'OPEN_REGISTER'] },
      { name: 'INVENTORY', displayName: 'Inventario', capabilities: ['RECEIVE_STOCK', 'AUDIT_STOCK'] },
      { name: 'MANAGER', displayName: 'Gerente', capabilities: ['MANAGE_ORDERS', 'VIEW_REPORTS'] },
      { name: 'ADMIN', displayName: 'Administrador', capabilities: ['MANAGE_BRANCHES', 'MANAGE_USERS'] },
    ],
    serverTime: '2026-08-29T10:00:00Z',
  }

  const ownerOptionsPayload = {
    schemaVersion: 1,
    actorRole: 'OWNER',
    items: [
      { name: 'SALES', displayName: 'Vendedor', capabilities: ['SELL_PRODUCTS'] },
      { name: 'CASHIER', displayName: 'Cajero', capabilities: ['PROCESS_PAYMENTS'] },
      { name: 'INVENTORY', displayName: 'Inventario', capabilities: ['RECEIVE_STOCK'] },
      { name: 'MANAGER', displayName: 'Gerente', capabilities: ['MANAGE_ORDERS'] },
      { name: 'ADMIN', displayName: 'Administrador', capabilities: ['MANAGE_USERS'] },
      { name: 'OWNER', displayName: 'Propietario', capabilities: ['FULL_CONTROL'] },
    ],
    serverTime: '2026-08-29T10:00:00Z',
  }

  it('acepta la respuesta V1 para ADMIN con 5 roles y sin OWNER', () => {
    const result = parseAdminRoleOptionsResponse(adminOptionsPayload)
    expect(result.schemaVersion).toBe(1)
    expect(result.actorRole).toBe('ADMIN')
    expect(result.items).toHaveLength(5)
    expect(result.items.some((i) => i.name === 'OWNER')).toBe(false)
    expect(result.items[0]).toEqual({
      name: 'SALES',
      displayName: 'Vendedor',
      capabilities: ['SELL_PRODUCTS', 'VIEW_CATALOG'],
    })
  })

  it('acepta la respuesta V1 para OWNER con los 6 roles incluyendo OWNER', () => {
    const result = parseAdminRoleOptionsResponse(ownerOptionsPayload)
    expect(result.schemaVersion).toBe(1)
    expect(result.actorRole).toBe('OWNER')
    expect(result.items).toHaveLength(6)
    expect(result.items.some((i) => i.name === 'OWNER')).toBe(true)
    expect(result.items[5]).toEqual({
      name: 'OWNER',
      displayName: 'Propietario',
      capabilities: ['FULL_CONTROL'],
    })
  })

  it('rechaza versiones incompatibles o distintas de schemaVersion 1', () => {
    expect(() => parseAdminRoleOptionsResponse({ ...adminOptionsPayload, schemaVersion: 2 })).toThrow()
    expect(() => parseAdminRoleOptionsResponse({ ...adminOptionsPayload, schemaVersion: 0 })).toThrow()
  })

  it('rechaza claves inesperadas o faltantes en la raíz y en los items', () => {
    expect(() => parseAdminRoleOptionsResponse({ ...adminOptionsPayload, extraField: true })).toThrow()

    const itemWithExtra = {
      ...adminOptionsPayload,
      items: [{ ...adminOptionsPayload.items[0], unknownKey: 'leak' }],
    }
    expect(() => parseAdminRoleOptionsResponse(itemWithExtra)).toThrow()

    const itemMissingCaps = {
      ...adminOptionsPayload,
      items: [{ name: 'SALES', displayName: 'Vendedor' }],
    }
    expect(() => parseAdminRoleOptionsResponse(itemMissingCaps)).toThrow()
  })

  it('rechaza un actorRole inválido', () => {
    expect(() => parseAdminRoleOptionsResponse({ ...adminOptionsPayload, actorRole: 'SUPERUSER' })).toThrow()
    expect(() => parseAdminRoleOptionsResponse({ ...adminOptionsPayload, actorRole: 'MANAGER' })).toThrow()
  })

  it('rechaza nombres de roles no reconocidos en items', () => {
    const invalidRole = {
      ...adminOptionsPayload,
      items: [{ name: 'SUPERADMIN', displayName: 'Super', capabilities: [] }],
    }
    expect(() => parseAdminRoleOptionsResponse(invalidRole)).toThrow()
  })

  it('rechaza capacidades que no sean listas o fechas sin zona horaria', () => {
    const badCaps = {
      ...adminOptionsPayload,
      items: [{ name: 'SALES', displayName: 'Vendedor', capabilities: 'not-array' }],
    }
    expect(() => parseAdminRoleOptionsResponse(badCaps)).toThrow()

    const badDate = {
      ...adminOptionsPayload,
      serverTime: '2026-08-29 10:00:00',
    }
    expect(() => parseAdminRoleOptionsResponse(badDate)).toThrow()
  })
})

describe('contrato de mutación set_admin_staff_role', () => {
  const mutationPayload = {
    schemaVersion: 1,
    userId: USER_ID,
    role: {
      name: 'MANAGER',
      displayName: 'Gerente',
    },
    updatedAt: '2026-08-29T10:00:00Z',
    serverTime: '2026-08-29T10:00:01Z',
  }

  describe('validateSetAdminStaffRoleInput', () => {
    it('acepta entrada válida con UUID y UserRole válido', () => {
      const result = validateSetAdminStaffRoleInput(USER_ID, 'MANAGER')
      expect(result).toEqual({ userId: USER_ID, roleName: 'MANAGER' })
    })

    it('rechaza IDs no UUID', () => {
      expect(() => validateSetAdminStaffRoleInput('not-a-uuid', 'CASHIER')).toThrow()
    })

    it('rechaza roles null, vacíos, NONE o no autorizados', () => {
      expect(() => validateSetAdminStaffRoleInput(USER_ID, null)).toThrow()
      expect(() => validateSetAdminStaffRoleInput(USER_ID, '')).toThrow()
      expect(() => validateSetAdminStaffRoleInput(USER_ID, 'NONE')).toThrow()
      expect(() => validateSetAdminStaffRoleInput(USER_ID, 'SUPERADMIN')).toThrow()
    })
  })

  describe('parseSetAdminStaffRoleResult', () => {
    it('acepta el resultado V1 exacto con rol actualizado', () => {
      const result = parseSetAdminStaffRoleResult(mutationPayload)
      expect(result).toEqual({
        schemaVersion: 1,
        userId: USER_ID,
        role: {
          name: 'MANAGER',
          displayName: 'Gerente',
        },
        updatedAt: '2026-08-29T10:00:00Z',
        serverTime: '2026-08-29T10:00:01Z',
      })
    })

    it('rechaza versiones distintas de 1', () => {
      expect(() => parseSetAdminStaffRoleResult({ ...mutationPayload, schemaVersion: 2 })).toThrow()
    })

    it('rechaza claves extra o faltantes', () => {
      expect(() => parseSetAdminStaffRoleResult({ ...mutationPayload, extra: 123 })).toThrow()
      expect(() => parseSetAdminStaffRoleResult({
        ...mutationPayload,
        role: { name: 'MANAGER', displayName: 'Gerente', extra: true },
      })).toThrow()
    })

    it('rechaza roles desconocidos o UUIDs inválidos', () => {
      expect(() => parseSetAdminStaffRoleResult({
        ...mutationPayload,
        role: { name: 'ROOT', displayName: 'Root' },
      })).toThrow()
      expect(() => parseSetAdminStaffRoleResult({
        ...mutationPayload,
        userId: 'invalid-id',
      })).toThrow()
    })

    it('rechaza fechas sin zona horaria', () => {
      expect(() => parseSetAdminStaffRoleResult({
        ...mutationPayload,
        updatedAt: '2026-08-29 10:00:00',
      })).toThrow()
      expect(() => parseSetAdminStaffRoleResult({
        ...mutationPayload,
        serverTime: '2026-08-29 10:00:00',
      })).toThrow()
    })
  })
})
