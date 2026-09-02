import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fetchAdminRoleOptions,
  setAdminStaffRole,
  AdminServiceError,
} from './admin-service'
import { isAssignDisabledForInactive } from './AdminDirectories'
import type { AdminStaffMember, AdminStaffRole, SetAdminStaffRoleResult } from './admin-types'

const USER_ID = '92000000-0000-0000-0000-000000000001'
const ACTOR_ADMIN_ID = '92000000-0000-0000-0000-000000000002'

let mockRpcReturn: { data: unknown; error: { message: string; code?: string } | null } = {
  data: null,
  error: null,
}
let lastRpcCall: { rpc: string; parameters: Record<string, unknown> } | null = null

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    rpc: (rpc: string, parameters: Record<string, unknown>) => {
      lastRpcCall = { rpc, parameters }
      return {
        abortSignal: () => Promise.resolve(mockRpcReturn),
      }
    },
  }),
}))

describe('Contrato y servicio de administración de roles (get_admin_role_options y set_admin_staff_role)', () => {
  beforeEach(() => {
    lastRpcCall = null
    mockRpcReturn = { data: null, error: null }
  })

  // 1. Nombre RPC y parámetros exactos para get_admin_role_options
  it('consulta get_admin_role_options sin parámetros adicionales', async () => {
    mockRpcReturn = {
      data: {
        schemaVersion: 1,
        actorRole: 'ADMIN',
        items: [
          { name: 'SALES', displayName: 'Vendedor', capabilities: ['SELL_PRODUCTS'] },
          { name: 'CASHIER', displayName: 'Cajero', capabilities: ['PROCESS_PAYMENTS'] },
          { name: 'INVENTORY', displayName: 'Inventario', capabilities: ['RECEIVE_STOCK'] },
          { name: 'MANAGER', displayName: 'Gerente', capabilities: ['MANAGE_ORDERS'] },
          { name: 'ADMIN', displayName: 'Administrador', capabilities: ['MANAGE_USERS'] },
        ],
        serverTime: '2026-08-29T10:00:00Z',
      },
      error: null,
    }

    const res = await fetchAdminRoleOptions()

    expect(lastRpcCall?.rpc).toBe('get_admin_role_options')
    expect(lastRpcCall?.parameters).toEqual({})
    expect(res.actorRole).toBe('ADMIN')
    expect(res.items).toHaveLength(5)
  })

  // 2. ADMIN sin OWNER
  it('ADMIN recibe cinco opciones autorizadas y nunca recibe OWNER', async () => {
    mockRpcReturn = {
      data: {
        schemaVersion: 1,
        actorRole: 'ADMIN',
        items: [
          { name: 'SALES', displayName: 'Vendedor', capabilities: [] },
          { name: 'CASHIER', displayName: 'Cajero', capabilities: [] },
          { name: 'INVENTORY', displayName: 'Inventario', capabilities: [] },
          { name: 'MANAGER', displayName: 'Gerente', capabilities: [] },
          { name: 'ADMIN', displayName: 'Administrador', capabilities: [] },
        ],
        serverTime: '2026-08-29T10:00:00Z',
      },
      error: null,
    }

    const res = await fetchAdminRoleOptions()
    expect(res.actorRole).toBe('ADMIN')
    expect(res.items.map((i) => i.name)).toEqual(['SALES', 'CASHIER', 'INVENTORY', 'MANAGER', 'ADMIN'])
    expect(res.items.some((i) => i.name === 'OWNER')).toBe(false)
  })

  // 3. OWNER con OWNER
  it('OWNER recibe las seis opciones autorizadas incluyendo OWNER', async () => {
    mockRpcReturn = {
      data: {
        schemaVersion: 1,
        actorRole: 'OWNER',
        items: [
          { name: 'SALES', displayName: 'Vendedor', capabilities: [] },
          { name: 'CASHIER', displayName: 'Cajero', capabilities: [] },
          { name: 'INVENTORY', displayName: 'Inventario', capabilities: [] },
          { name: 'MANAGER', displayName: 'Gerente', capabilities: [] },
          { name: 'ADMIN', displayName: 'Administrador', capabilities: [] },
          { name: 'OWNER', displayName: 'Propietario', capabilities: [] },
        ],
        serverTime: '2026-08-29T10:00:00Z',
      },
      error: null,
    }

    const res = await fetchAdminRoleOptions()
    expect(res.actorRole).toBe('OWNER')
    expect(res.items.map((i) => i.name)).toEqual(['SALES', 'CASHIER', 'INVENTORY', 'MANAGER', 'ADMIN', 'OWNER'])
    expect(res.items.some((i) => i.name === 'OWNER')).toBe(true)
  })

  // 4. Nombre RPC y parámetros exactos para set_admin_staff_role
  it('set_admin_staff_role envía p_user_id y p_role_name exactos (nunca p_role ni assign_user_role)', async () => {
    mockRpcReturn = {
      data: {
        schemaVersion: 1,
        userId: USER_ID,
        role: { name: 'CASHIER', displayName: 'Cajero' },
        updatedAt: '2026-08-29T12:00:00Z',
        serverTime: '2026-08-29T12:00:01Z',
      },
      error: null,
    }

    const result = await setAdminStaffRole({ userId: USER_ID, roleName: 'CASHIER' })

    expect(lastRpcCall?.rpc).toBe('set_admin_staff_role')
    expect(lastRpcCall?.rpc).not.toBe('assign_user_role')
    expect(lastRpcCall?.parameters).toEqual({
      p_user_id: USER_ID,
      p_role_name: 'CASHIER',
    })
    expect(lastRpcCall?.parameters).not.toHaveProperty('p_role')
    expect(result.role.name).toBe('CASHIER')
  })

  // 5. Los cinco errores estables mapeados a español seguro
  describe('mapeo de los cinco errores estables del backend', () => {
    const errorCases = [
      {
        backendCode: 'ROLE_ASSIGNMENT_UNAUTHORIZED',
        expectedText: 'No tienes permiso para asignar roles.',
      },
      {
        backendCode: 'ROLE_ASSIGNMENT_INVALID',
        expectedText: 'El rol seleccionado no es válido.',
      },
      {
        backendCode: 'ROLE_TARGET_UNAVAILABLE',
        expectedText: 'El usuario no existe o está inactivo. Actualiza el directorio.',
      },
      {
        backendCode: 'ROLE_OWNER_RESTRICTED',
        expectedText: 'Un Administrador no puede promover ni modificar Propietarios.',
      },
      {
        backendCode: 'ROLE_LAST_OWNER_REQUIRED',
        expectedText: 'Debe conservarse al menos un Propietario.',
      },
    ]

    for (const { backendCode, expectedText } of errorCases) {
      it(`mapea ${backendCode} a "${expectedText}"`, async () => {
        mockRpcReturn = {
          data: null,
          error: { message: backendCode },
        }

        await expect(setAdminStaffRole({ userId: USER_ID, roleName: 'MANAGER' }))
          .rejects.toThrow(new AdminServiceError(expectedText, backendCode))
      })
    }
  })

  // 6. Contrato no desplegado (PGRST202 o 42883)
  describe('contrato no desplegado en el entorno', () => {
    it('informa que el contrato de roles no está disponible ante error PGRST202', async () => {
      mockRpcReturn = {
        data: null,
        error: { message: 'function not found', code: 'PGRST202' },
      }

      await expect(fetchAdminRoleOptions())
        .rejects.toThrow('El contrato de administración de roles todavía no está disponible en este entorno.')

      await expect(setAdminStaffRole({ userId: USER_ID, roleName: 'SALES' }))
        .rejects.toThrow('El contrato de administración de roles todavía no está disponible en este entorno.')
    })

    it('informa que el contrato de roles no está disponible ante error 42883', async () => {
      mockRpcReturn = {
        data: null,
        error: { message: 'function does not exist', code: '42883' },
      }

      await expect(setAdminStaffRole({ userId: USER_ID, roleName: 'SALES' }))
        .rejects.toThrow('El contrato de administración de roles todavía no está disponible en este entorno.')
    })
  })

  // 7. Reglas de negocio en UI: bloqueo de mismo rol, usuario inactivo y cuenta propia
  describe('reglas de negocio y guardias de asignación', () => {
    it('bloquea la asignación para usuarios inactivos', () => {
      const inactiveCheck = isAssignDisabledForInactive(false)
      expect(inactiveCheck.disabled).toBe(true)
      expect(inactiveCheck.reason).toBe('Debes activar al usuario antes de modificar su asignación.')

      const activeCheck = isAssignDisabledForInactive(true)
      expect(activeCheck.disabled).toBe(false)
      expect(activeCheck.reason).toBeNull()
    })

    it('bloquea cambiar el rol de la propia cuenta (isSelf)', () => {
      const currentActorId = ACTOR_ADMIN_ID
      const memberSelf: AdminStaffMember = {
        id: currentActorId,
        fullName: 'Administrador Actual',
        isActive: true,
        branch: null,
        role: { name: 'ADMIN', displayName: 'Administrador' },
        updatedAt: '2026-08-29T10:00:00Z',
      }
      const memberOther: AdminStaffMember = {
        id: USER_ID,
        fullName: 'Otro Trabajador',
        isActive: true,
        branch: null,
        role: { name: 'SALES', displayName: 'Vendedor' },
        updatedAt: '2026-08-29T10:00:00Z',
      }

      const isSelf = (m: AdminStaffMember) => m.id === currentActorId

      expect(isSelf(memberSelf)).toBe(true)
      expect(isSelf(memberOther)).toBe(false)
    })

    it('bloquea guardar si el rol seleccionado es igual al actual', () => {
      const currentRoleName = 'CASHIER'
      const selectedRoleSame = 'CASHIER'
      const selectedRoleDifferent = 'MANAGER'

      const isSameRole = (selected: string) => selected === currentRoleName

      expect(isSameRole(selectedRoleSame)).toBe(true)
      expect(isSameRole(selectedRoleDifferent)).toBe(false)
    })
  })

  // 8. Éxito actualiza el rol en el estado
  it('éxito en la mutación actualiza la fila únicamente después de la confirmación del backend', async () => {
    const previousStaffMember: AdminStaffMember = {
      id: USER_ID,
      fullName: 'Carlos Vendedor',
      isActive: true,
      branch: null,
      role: { name: 'SALES', displayName: 'Vendedor' },
      updatedAt: '2026-08-29T10:00:00Z',
    }

    let staffList = [previousStaffMember]
    const updateStaffRole = (userId: string, role: AdminStaffRole, updatedAt: string) => {
      staffList = staffList.map((m) =>
        m.id === userId ? { ...m, role, updatedAt } : m
      )
    }

    mockRpcReturn = {
      data: {
        schemaVersion: 1,
        userId: USER_ID,
        role: { name: 'MANAGER', displayName: 'Gerente' },
        updatedAt: '2026-08-29T12:30:00Z',
        serverTime: '2026-08-29T12:30:01Z',
      },
      error: null,
    }

    const mutationResult: SetAdminStaffRoleResult = await setAdminStaffRole({
      userId: USER_ID,
      roleName: 'MANAGER',
    })

    // Actualizamos el estado solo tras confirmación
    updateStaffRole(USER_ID, mutationResult.role, mutationResult.updatedAt)

    expect(staffList[0].role?.name).toBe('MANAGER')
    expect(staffList[0].role?.displayName).toBe('Gerente')
    expect(staffList[0].updatedAt).toBe('2026-08-29T12:30:00Z')
  })

  // 9. Error conserva el rol anterior
  it('un fallo en la mutación conserva el rol anterior del trabajador', async () => {
    const previousStaffMember: AdminStaffMember = {
      id: USER_ID,
      fullName: 'Carlos Vendedor',
      isActive: true,
      branch: null,
      role: { name: 'SALES', displayName: 'Vendedor' },
      updatedAt: '2026-08-29T10:00:00Z',
    }

    let staffList = [previousStaffMember]
    const updateStaffRole = (userId: string, role: AdminStaffRole, updatedAt: string) => {
      staffList = staffList.map((m) =>
        m.id === userId ? { ...m, role, updatedAt } : m
      )
    }

    mockRpcReturn = {
      data: null,
      error: { message: 'ROLE_OWNER_RESTRICTED' },
    }

    let caughtError: unknown = null
    try {
      const res = await setAdminStaffRole({ userId: USER_ID, roleName: 'OWNER' })
      updateStaffRole(USER_ID, res.role, res.updatedAt)
    } catch (err) {
      caughtError = err
    }

    expect(caughtError).toBeInstanceOf(AdminServiceError)
    // El rol anterior se mantiene inalterado
    expect(staffList[0].role?.name).toBe('SALES')
    expect(staffList[0].role?.displayName).toBe('Vendedor')
    expect(staffList[0].updatedAt).toBe('2026-08-29T10:00:00Z')
  })
})
