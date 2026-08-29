import { hasCapability } from './access-helpers'
import type { UserAccessContext } from './access-types'

export const PROTECTED_DESTINATIONS = ['/caja', '/admin'] as const

export type ProtectedDestination = (typeof PROTECTED_DESTINATIONS)[number]

export const ADMIN_ENTRY_CAPABILITIES = [
  'MANAGE_PRODUCTS',
  'MANAGE_PRICES',
  'MANAGE_BRANCHES',
  'MANAGE_USERS',
  'ASSIGN_ROLES',
  'VIEW_BRANCH_SALES',
  'VIEW_ALL_SALES',
  'VIEW_REPORTS',
  'MANAGE_INVENTORY',
  'MANAGE_DISCOUNTS',
  'VIEW_AUDIT',
  'MANAGE_SETTINGS',
] as const

export type AdminModuleId = 'editorial' | 'sucursales' | 'inventario' | 'stock' | 'promociones' | 'ventas' | 'pedidos' | 'personal'

export interface AdminModuleRule {
  id: AdminModuleId
  label: string
  anyCapability: readonly string[]
  pendingBackendPermission?: boolean
}

export const ADMIN_MODULE_RULES: readonly AdminModuleRule[] = [
  { id: 'editorial', label: '📝 Editorial', anyCapability: [], pendingBackendPermission: true },
  { id: 'sucursales', label: '🏬 Sucursales', anyCapability: ['MANAGE_BRANCHES', 'MANAGE_USERS'] },
  { id: 'inventario', label: '📦 Productos', anyCapability: ['MANAGE_PRODUCTS'] },
  { id: 'stock', label: '📈 Inventario', anyCapability: ['MANAGE_INVENTORY'] },
  { id: 'promociones', label: '🏷 Promociones', anyCapability: ['MANAGE_DISCOUNTS'] },
  { id: 'ventas', label: '📊 Ventas y reportes', anyCapability: ['VIEW_BRANCH_SALES', 'VIEW_ALL_SALES', 'VIEW_REPORTS'] },
  { id: 'pedidos', label: '🧾 Pedidos', anyCapability: ['VIEW_BRANCH_SALES', 'VIEW_ALL_SALES'] },
  { id: 'personal', label: '👥 Personal', anyCapability: ['MANAGE_USERS', 'ASSIGN_ROLES'] },
] as const

export function hasAnyCapability(context: UserAccessContext | null, capabilities: readonly string[]): boolean {
  return capabilities.some((capability) => hasCapability(context, capability))
}

export function canEnterCashier(context: UserAccessContext | null): boolean {
  return context?.accessState === 'ACTIVE'
    && hasCapability(context, 'OPERATE_CASHIER')
    && context.branch !== null
    && context.branch.isActive
}

export function canEnterAdmin(context: UserAccessContext | null): boolean {
  return context?.accessState === 'ACTIVE' && hasAnyCapability(context, ADMIN_ENTRY_CAPABILITIES)
}

export function isAdminModuleAuthorized(context: UserAccessContext | null, moduleId: AdminModuleId): boolean {
  const rule = ADMIN_MODULE_RULES.find(({ id }) => id === moduleId)
  return Boolean(rule && !rule.pendingBackendPermission && hasAnyCapability(context, rule.anyCapability))
}

export function getAuthorizedAdminModules(context: UserAccessContext | null): AdminModuleId[] {
  return ADMIN_MODULE_RULES.filter(({ id }) => isAdminModuleAuthorized(context, id)).map(({ id }) => id)
}

export function getSafeReturnTo(search: string): ProtectedDestination | null {
  const match = /^\?returnTo=([^&]+)$/.exec(search)
  if (!match) return null

  const rawValue = match[1]
  if (rawValue.includes('%') || rawValue.includes('\\') || rawValue.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(rawValue)) {
    return null
  }

  return PROTECTED_DESTINATIONS.includes(rawValue as ProtectedDestination)
    ? rawValue as ProtectedDestination
    : null
}

export function getLoginPath(returnTo: ProtectedDestination): string {
  return `/login?returnTo=${returnTo}`
}

export function canAccessDestination(context: UserAccessContext | null, destination: ProtectedDestination): boolean {
  return destination === '/caja' ? canEnterCashier(context) : canEnterAdmin(context)
}
