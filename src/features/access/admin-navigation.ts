import type { AdminModuleId } from './access-rules'

export type AdminTaskId = 'plants' | 'reception' | 'sales' | 'administration'
export interface AdminTask { id: AdminTaskId; label: string; modules: AdminModuleId[] }

// Presentation only. Module access and reception actions retain their server guards.
export function adminTasks(authorized: readonly AdminModuleId[], canCashier = false): AdminTask[] {
  const definitions: AdminTask[] = [
    { id: 'plants', label: 'Plantas', modules: ['inventario', 'stock'] },
    { id: 'reception', label: 'Recepción', modules: ['compras'] },
    { id: 'sales', label: 'Ventas', modules: ['ventas', 'pedidos', 'promociones'] },
    { id: 'administration', label: 'Administración', modules: ['personal', 'sucursales', 'clientes', 'boletin'] },
  ]
  return definitions.map(task => ({ ...task, modules: task.modules.filter(id => authorized.includes(id)) })).filter(task => task.modules.length || (task.id === 'sales' && canCashier))
}

export const adminTaskModuleLabel: Partial<Record<AdminModuleId, string>> = {
  inventario: 'Catálogo y revisión de plantas', stock: 'Existencias y conteos', compras: 'Compras y proveedores',
  ventas: 'Historial y reportes', pedidos: 'Pedidos de clientes', promociones: 'Promociones',
  personal: 'Personal y permisos', sucursales: 'Sucursales', clientes: 'Clientes', boletin: 'Boletín Verde',
}
