import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createBranch,
  updateBranch,
  setBranchActive,
  assignUserBranch,
  assignUserRole,
  setUserActive,
  AdminServiceError,
} from './admin-service'
import {
  validateAssignUserBranchInput,
  validateAssignUserRoleInput,
  validateSetUserActiveInput,
  parseBranchRowResponse,
  parseVoidResponse,
  parseAdminStaffResponse,
} from './admin-parser'
import {
  isToggleActiveDisabled,
  isAssignDisabledForInactive,
} from './AdminDirectories'
import { USER_ROLES } from '../access/access-types'

interface GlobalWithWindow {
  window?: {
    setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>
    clearTimeout: (id: ReturnType<typeof setTimeout> | null | undefined) => void
  }
}

if (typeof window === 'undefined') {
  const g = globalThis as unknown as GlobalWithWindow
  g.window = {
    setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout> | null | undefined) => {
      if (id) clearTimeout(id)
    },
  }
}

let mockRpcReturn: { data: unknown; error: { message: string } | null } = { data: null, error: null }
let lastRpcCall: { rpc: string; parameters: Record<string, unknown> } | null = null

let mockSupabaseImplementation = () => {
  return {
    rpc: (rpc: string, parameters: Record<string, unknown>) => {
      lastRpcCall = { rpc, parameters }
      return {
        abortSignal: () => {
          return Promise.resolve(mockRpcReturn)
        },
      }
    },
  }
}

vi.mock('../../lib/supabase/client', () => {
  return {
    getSupabaseClient: () => mockSupabaseImplementation(),
  }
})

const VALID_BRANCH_ROW = {
  id: '10000000-0000-0000-0000-000000000001',
  code: 'CENTRO',
  name: 'Sucursal Centro',
  is_active: true,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-08-29T12:00:00Z',
}

describe('Conformidad contractual de mutaciones administrativas', () => {
  beforeEach(() => {
    mockRpcReturn = { data: VALID_BRANCH_ROW, error: null }
    lastRpcCall = null
    mockSupabaseImplementation = () => {
      return {
        rpc: (rpc: string, parameters: Record<string, unknown>) => {
          lastRpcCall = { rpc, parameters }
          return {
            abortSignal: () => {
              return Promise.resolve(mockRpcReturn)
            },
          }
        },
      }
    }
  })

  // --- 1. create_branch envía p_code y p_name ---
  it('1. create_branch envía p_code y p_name', async () => {
    await createBranch({ code: 'NORTE', name: 'Sucursal Norte' })

    expect(lastRpcCall).not.toBeNull()
    expect(lastRpcCall?.rpc).toBe('create_branch')
    expect(lastRpcCall?.parameters).toEqual({
      p_code: 'NORTE',
      p_name: 'Sucursal Norte',
    })
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_id')
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_branch_id')
  })

  // --- 2. create_branch parsea fila completa ---
  it('2. create_branch parsea fila completa', async () => {
    const result = await createBranch({ code: 'CENTRO', name: 'Sucursal Centro' })

    expect(result.id).toBe(VALID_BRANCH_ROW.id)
    expect(result.code).toBe('CENTRO')
    expect(result.name).toBe('Sucursal Centro')
    expect(result.isActive).toBe(true)
    expect(result.createdAt).toBe('2026-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2026-08-29T12:00:00Z')
  })

  // --- 3. update_branch usa p_branch_id y nunca p_id ---
  it('3. update_branch usa p_branch_id y nunca p_id', async () => {
    const branchId = '10000000-0000-0000-0000-000000000001'

    await updateBranch({ id: branchId, code: 'CENTRO', name: 'Centro Actualizado' })

    expect(lastRpcCall?.rpc).toBe('update_branch')
    expect(lastRpcCall?.parameters).toHaveProperty('p_branch_id', branchId)
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_id')
  })

  // --- 4. update_branch parsea fila completa ---
  it('4. update_branch parsea fila completa', async () => {
    const result = await updateBranch({
      id: '10000000-0000-0000-0000-000000000001',
      code: 'CENTRO',
      name: 'Centro Actualizado',
    })

    expect(result.id).toBe(VALID_BRANCH_ROW.id)
    expect(result.isActive).toBe(true)
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  // --- 5. set_branch_active usa p_branch_id y p_is_active ---
  it('5. set_branch_active usa p_branch_id y p_is_active', async () => {
    const branchId = '10000000-0000-0000-0000-000000000001'

    await setBranchActive(branchId, false)

    expect(lastRpcCall?.rpc).toBe('set_branch_active')
    expect(lastRpcCall?.parameters).toEqual({
      p_branch_id: branchId,
      p_is_active: false,
    })
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_id')
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_active')
  })

  // --- 6. set_branch_active parsea fila completa ---
  it('6. set_branch_active parsea fila completa', async () => {
    mockRpcReturn = {
      data: { ...VALID_BRANCH_ROW, is_active: false },
      error: null,
    }

    const result = await setBranchActive('10000000-0000-0000-0000-000000000001', false)

    expect(result.isActive).toBe(false)
    expect(result.id).toBe(VALID_BRANCH_ROW.id)
    expect(result.code).toBe('CENTRO')
  })

  // --- 7. assign_user_branch usa p_user_id y p_branch_id ---
  it('7. assign_user_branch usa p_user_id y p_branch_id', async () => {
    mockRpcReturn = { data: null, error: null }
    const userId = '20000000-0000-0000-0000-000000000001'
    const branchId = '10000000-0000-0000-0000-000000000001'

    await assignUserBranch({ userId, branchId })

    expect(lastRpcCall?.rpc).toBe('assign_user_branch')
    expect(lastRpcCall?.parameters).toEqual({
      p_user_id: userId,
      p_branch_id: branchId,
    })
  })

  // --- 8. sucursal null se rechaza antes del RPC ---
  it('8. sucursal null se rechaza antes del RPC', () => {
    expect(() => validateAssignUserBranchInput('20000000-0000-0000-0000-000000000001', null)).toThrow()
    expect(() => validateAssignUserBranchInput('20000000-0000-0000-0000-000000000001', '')).toThrow()
    expect(lastRpcCall).toBeNull()
  })

  // --- 9. assign_user_role usa p_user_id y p_role_name ---
  it('9. assign_user_role usa p_user_id y p_role_name', async () => {
    mockRpcReturn = { data: null, error: null }
    const userId = '20000000-0000-0000-0000-000000000001'

    await assignUserRole({ userId, role: 'CASHIER' })

    expect(lastRpcCall?.rpc).toBe('assign_user_role')
    expect(lastRpcCall?.parameters).toEqual({
      p_user_id: userId,
      p_role_name: 'CASHIER',
    })
  })

  // --- 10. nunca se envía p_role ---
  it('10. nunca se envía p_role', async () => {
    mockRpcReturn = { data: null, error: null }

    await assignUserRole({ userId: '20000000-0000-0000-0000-000000000001', role: 'SALES' })

    expect(lastRpcCall?.parameters).not.toHaveProperty('p_role')
    expect(lastRpcCall?.parameters).toHaveProperty('p_role_name', 'SALES')
  })

  // --- 11. rol null/NONE se rechaza antes del RPC ---
  it('11. rol null/NONE se rechaza antes del RPC', () => {
    const userId = '20000000-0000-0000-0000-000000000001'

    expect(() => validateAssignUserRoleInput(userId, null)).toThrow()
    expect(() => validateAssignUserRoleInput(userId, '')).toThrow()
    expect(() => validateAssignUserRoleInput(userId, 'NONE')).toThrow()
    expect(lastRpcCall).toBeNull()
  })

  // --- 12. los seis roles válidos se aceptan ---
  it('12. los seis roles válidos se aceptan', () => {
    const userId = '20000000-0000-0000-0000-000000000001'

    for (const role of USER_ROLES) {
      const result = validateAssignUserRoleInput(userId, role)
      expect(result.role).toBe(role)
      expect(result.userId).toBe(userId)
    }
    expect(USER_ROLES).toHaveLength(6)
  })

  // --- 13. assign_user_role procesa void ---
  it('13. assign_user_role procesa void', async () => {
    mockRpcReturn = { data: null, error: null }

    await expect(
      assignUserRole({ userId: '20000000-0000-0000-0000-000000000001', role: 'MANAGER' })
    ).resolves.not.toThrow()
  })

  // --- 14. set_user_active continúa usando sus parámetros correctos ---
  it('14. set_user_active continúa usando sus parámetros correctos', async () => {
    mockRpcReturn = { data: null, error: null }
    const userId = '20000000-0000-0000-0000-000000000001'

    await setUserActive(userId, true)

    expect(lastRpcCall?.rpc).toBe('set_user_active')
    expect(lastRpcCall?.parameters).toEqual({
      p_user_id: userId,
      p_is_active: true,
    })
  })

  // --- 15. respuestas incompatibles se rechazan ---
  it('15. respuestas incompatibles se rechazan', () => {
    // Branch row sin is_active
    expect(() => parseBranchRowResponse({ id: '10000000-0000-0000-0000-000000000001', code: 'A', name: 'X' })).toThrow()

    // Branch row con campo camelCase en vez de snake_case
    expect(() => parseBranchRowResponse({
      id: '10000000-0000-0000-0000-000000000001',
      code: 'CENTRO',
      name: 'Sucursal',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })).toThrow()

    // UUID escalar ya no es aceptado como respuesta de create_branch
    expect(() => parseBranchRowResponse('10000000-0000-0000-0000-000000000001')).toThrow()

    // void no es branch row
    expect(() => parseBranchRowResponse(null)).toThrow()

    // parseVoidResponse rechaza objetos
    expect(() => parseVoidResponse({ id: 'abc' })).toThrow()
  })

  // --- 16. mensajes backend se sanitizan ---
  it('16. mensajes backend se sanitizan', async () => {
    const errorMessages: Array<{ backend: string; notContains: string }> = [
      { backend: 'Branch management is not allowed', notContains: 'Branch management' },
      { backend: 'Branch data is invalid', notContains: 'Branch data' },
      { backend: 'Branch code is unavailable', notContains: 'Branch code is' },
      { backend: 'Branch is unavailable', notContains: 'Branch is unavailable' },
      { backend: 'Branch assignment is not allowed', notContains: 'Branch assignment' },
      { backend: 'Target profile is unavailable', notContains: 'Target profile' },
      { backend: 'Target branch is unavailable', notContains: 'Target branch' },
      { backend: 'Role assignment is not allowed', notContains: 'Role assignment' },
      { backend: 'ADMIN cannot grant or modify OWNER', notContains: 'ADMIN cannot grant' },
      { backend: 'The last OWNER cannot be reassigned', notContains: 'The last OWNER cannot be reassigned' },
      { backend: 'ADMIN cannot modify OWNER status', notContains: 'ADMIN cannot modify' },
      { backend: 'The last active OWNER cannot be deactivated', notContains: 'The last active OWNER' },
      { backend: 'User management is not allowed', notContains: 'User management' },
    ]

    for (const { backend, notContains } of errorMessages) {
      mockRpcReturn = { data: null, error: { message: backend } }
      try {
        await setUserActive('20000000-0000-0000-0000-000000000001', true)
        expect.fail(`Should have thrown for: ${backend}`)
      } catch (err) {
        expect(err).toBeInstanceOf(AdminServiceError)
        const msg = (err as AdminServiceError).message
        expect(msg).not.toBe(backend)
        expect(msg).not.toContain(notContains)
      }
    }
  })

  // --- 17. ADMIN/OWNER mantienen su jerarquía ---
  it('17. ADMIN/OWNER mantienen su jerarquía', () => {
    // ADMIN no puede tocar OWNER
    const adminVsOwner = isToggleActiveDisabled('a1', 'ADMIN', 'o1', 'OWNER', false)
    expect(adminVsOwner.disabled).toBe(true)

    // OWNER sí puede tocar otro OWNER
    const ownerVsOwner = isToggleActiveDisabled('o1', 'OWNER', 'o2', 'OWNER', false)
    expect(ownerVsOwner.disabled).toBe(false)

    // Nadie puede modificarse a sí mismo
    const selfMod = isToggleActiveDisabled('x1', 'OWNER', 'x1', 'OWNER', false)
    expect(selfMod.disabled).toBe(true)
  })

  // --- 18. una persona sin rol o sucursal puede recibir una asignación válida ---
  it('18. una persona sin rol o sucursal puede recibir una asignación válida', () => {
    // Un usuario sin sucursal recibe una asignación válida
    const branchInput = validateAssignUserBranchInput(
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )
    expect(branchInput.userId).toBe('20000000-0000-0000-0000-000000000001')
    expect(branchInput.branchId).toBe('10000000-0000-0000-0000-000000000001')

    // Un usuario sin rol recibe un rol válido
    const roleInput = validateAssignUserRoleInput(
      '20000000-0000-0000-0000-000000000001',
      'SALES'
    )
    expect(roleInput.userId).toBe('20000000-0000-0000-0000-000000000001')
    expect(roleInput.role).toBe('SALES')

    // isAssignDisabledForInactive permite asignación a usuarios activos
    const activeCheck = isAssignDisabledForInactive(true)
    expect(activeCheck.disabled).toBe(false)
  })

  // --- Preservación de set_user_active ---
  it('validateSetUserActiveInput valida correctamente', () => {
    const valid = validateSetUserActiveInput('92000000-0000-0000-0000-000000000001', true)
    expect(valid.userId).toBe('92000000-0000-0000-0000-000000000001')
    expect(valid.isActive).toBe(true)

    expect(() => validateSetUserActiveInput('invalid', true)).toThrow()
    expect(() => validateSetUserActiveInput('92000000-0000-0000-0000-000000000001', 'true')).toThrow()
  })

  it('parseBranchRowResponse valida la fila completa de public.branches', () => {
    const result = parseBranchRowResponse(VALID_BRANCH_ROW)
    expect(result.id).toBe(VALID_BRANCH_ROW.id)
    expect(result.code).toBe('CENTRO')
    expect(result.name).toBe('Sucursal Centro')
    expect(result.isActive).toBe(true)
    expect(result.createdAt).toBe('2026-01-15T10:00:00Z')
    expect(result.updatedAt).toBe('2026-08-29T12:00:00Z')
  })

  it('parseBranchRowResponse rechaza campos camelCase (no snake_case)', () => {
    expect(() => parseBranchRowResponse({
      id: '10000000-0000-0000-0000-000000000001',
      code: 'CENTRO',
      name: 'Sucursal Centro',
      isActive: true,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-08-29T12:00:00Z',
    })).toThrow()
  })

  it('usuario inactivo conserva rol y sucursal', () => {
    const rawStaffResponse = {
      schemaVersion: 1,
      items: [{
        id: '92000000-0000-0000-0000-000000000001',
        fullName: 'Trabajador Inactivo',
        isActive: false,
        branch: { id: '91000000-0000-0000-0000-000000000001', code: 'CENTRO', name: 'Sucursal Centro', isActive: true },
        role: { name: 'CASHIER', displayName: 'Cajero' },
        updatedAt: '2026-08-29T10:00:00Z',
      }],
      page: { limit: 50, hasMore: false, nextCursor: null },
      serverTime: '2026-08-29T10:01:00Z',
    }

    const parsed = parseAdminStaffResponse(rawStaffResponse)
    const member = parsed.items[0]

    expect(member.isActive).toBe(false)
    expect(member.branch?.code).toBe('CENTRO')
    expect(member.role?.name).toBe('CASHIER')
  })

  it('usuario inactivo no permite asignación hasta reactivarse', () => {
    expect(isAssignDisabledForInactive(false).disabled).toBe(true)
    expect(isAssignDisabledForInactive(true).disabled).toBe(false)
  })

  it('doble pulsación no duplica la mutación', () => {
    const check = isToggleActiveDisabled('actor-1', 'OWNER', 'target-1', 'CASHIER', true)
    expect(check.disabled).toBe(true)
    expect(check.reason).toBe('Operación en curso para este usuario.')
  })

  it('la UI no muestra correo ni datos de auth.users', () => {
    const rawStaffResponse = {
      schemaVersion: 1,
      items: [{
        id: '92000000-0000-0000-0000-000000000001',
        fullName: 'Juan Pérez',
        isActive: true,
        branch: null,
        role: null,
        updatedAt: '2026-08-29T10:00:00Z',
      }],
      page: { limit: 50, hasMore: false, nextCursor: null },
      serverTime: '2026-08-29T10:01:00Z',
    }

    const parsed = parseAdminStaffResponse(rawStaffResponse)
    const member = parsed.items[0]

    expect(member).not.toHaveProperty('email')
    expect(member).not.toHaveProperty('email_confirmed_at')
    expect(member).not.toHaveProperty('raw_user_meta_data')
  })
})
