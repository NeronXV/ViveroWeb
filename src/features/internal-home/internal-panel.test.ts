import { describe, expect, it } from 'vitest'
import {
  canEnterCashier,
  canEnterAdmin,
  getAuthorizedAdminModules,
  getSafeReturnTo,
  canAccessDestination,
  canViewCatalog,
  getWorkspaceTitle,
} from '../access/access-rules'
import type { UserAccessContext } from '../access/access-types'

const USER_ID = '33000000-0000-0000-0000-000000000001'

function createContext(overrides: Partial<UserAccessContext> = {}): UserAccessContext {
  return {
    schemaVersion: 1,
    userId: USER_ID,
    accessState: 'ACTIVE',
    profile: {
      fullName: 'Test User',
      avatarPath: null,
      isActive: true,
    },
    role: { name: 'CASHIER', displayName: 'Cajero' },
    branch: {
      id: 'b1',
      code: 'NORTE',
      name: 'Sucursal Norte',
      isActive: true,
    },
    capabilities: ['OPERATE_CASHIER'],
    ...overrides,
  }
}

describe('Pruebas de Acceso al Panel Interno', () => {
  describe('1. Cajero con OPERATE_CASHIER y sucursal activa', () => {
    it('puede entrar a Caja y no a Administración sin capacidades', () => {
      const context = createContext()
      expect(canEnterCashier(context)).toBe(true)
      expect(canEnterAdmin(context)).toBe(false)
    })
  })

  describe('2. Cajero sin sucursal u o inactiva', () => {
    it('no puede abrir Caja si no tiene sucursal', () => {
      const context = createContext({ branch: null })
      expect(canEnterCashier(context)).toBe(false)
    })

    it('no puede abrir Caja si la sucursal está inactiva', () => {
      const context = createContext({
        branch: { id: 'b1', code: 'INACTIVA', name: 'Sucursal Inactiva', isActive: false },
      })
      expect(canEnterCashier(context)).toBe(false)
    })
  })

  describe('3. Gerente', () => {
    it('ve Caja cuando corresponde y ve módulos administrativos permitidos', () => {
      const context = createContext({
        role: { name: 'MANAGER', displayName: 'Gerente' },
        capabilities: ['OPERATE_CASHIER', 'MANAGE_PRODUCTS', 'VIEW_REPORTS'],
      })
      expect(canEnterCashier(context)).toBe(true)
      expect(canEnterAdmin(context)).toBe(true)
      expect(getAuthorizedAdminModules(context)).toContain('inventario')
      expect(getAuthorizedAdminModules(context)).toContain('ventas')
      expect(getAuthorizedAdminModules(context)).not.toContain('personal')
      expect(getWorkspaceTitle(context)).toBe('Panel de gerencia')
    })
  })

  describe('4. Administrador o Dueño', () => {
    it('ve Administración y ve Caja solo si tiene sucursal y capacidad', () => {
      const context = createContext({
        role: { name: 'ADMIN', displayName: 'Administrador' },
        capabilities: ['MANAGE_USERS', 'ASSIGN_ROLES'],
        branch: null, // Sin sucursal asignada
      })
      expect(canEnterAdmin(context)).toBe(true)
      expect(canEnterCashier(context)).toBe(false)
      expect(getAuthorizedAdminModules(context)).toContain('personal')
      expect(getWorkspaceTitle(context)).toBe('Panel de administración')
    })
  })

  describe('panel de trabajador', () => {
    it('ofrece catálogo por capacidad y no por el nombre del rol', () => {
      const context = createContext({
        role: { name: 'SALES', displayName: 'Ventas' },
        capabilities: ['VIEW_CATALOG'],
      })
      expect(canViewCatalog(context)).toBe(true)
      expect(getWorkspaceTitle(context)).toBe('Panel de trabajador')
    })
  })

  describe('5. Usuario activo sin capacidades', () => {
    it('permanece autenticado pero no recibe acceso indebido', () => {
      const context = createContext({ capabilities: [] })
      expect(canEnterCashier(context)).toBe(false)
      expect(canEnterAdmin(context)).toBe(false)
    })
  })

  describe('6. Perfil inactivo', () => {
    it('no obtiene enlaces operativos de ningún tipo', () => {
      const context = createContext({ accessState: 'PROFILE_INACTIVE' })
      expect(canEnterCashier(context)).toBe(false)
      expect(canEnterAdmin(context)).toBe(false)
    })
  })

  describe('7 y 8. Redirección y returnTo', () => {
    it('obtiene null en getSafeReturnTo si la búsqueda no tiene returnTo', () => {
      expect(getSafeReturnTo('')).toBeNull()
    })

    it('respeta returnTo válido y autorizado', () => {
      expect(getSafeReturnTo('?returnTo=/caja')).toBe('/caja')
      expect(getSafeReturnTo('?returnTo=/admin')).toBe('/admin')
      expect(getSafeReturnTo('?returnTo=/panel')).toBe('/panel')
    })

    it('previene redirecciones abiertas o inválidas', () => {
      expect(getSafeReturnTo('?returnTo=https://google.com')).toBeNull()
      expect(getSafeReturnTo('?returnTo=//evil.com')).toBeNull()
      expect(getSafeReturnTo('?returnTo=/xyz')).toBeNull()
    })
  })

  describe('9. canAccessDestination', () => {
    it('permite /panel para cualquier perfil activo', () => {
      const context = createContext({ capabilities: [] }) // Sin capacidades
      expect(canAccessDestination(context, '/panel')).toBe(true)
    })

    it('deniega /panel para perfiles inactivos', () => {
      const context = createContext({ accessState: 'PROFILE_INACTIVE' })
      expect(canAccessDestination(context, '/panel')).toBe(false)
    })
  })

  describe('10 y 11. Reglas de negocio', () => {
    it('los nombres de rol no conceden accesos directos si no tienen capacidades asignadas', () => {
      const context = createContext({
        role: { name: 'OWNER', displayName: 'Dueño' },
        capabilities: [], // Sin capacidades explícitas
      })
      expect(canEnterAdmin(context)).toBe(false)
    })
  })
})
