import type { AdminModuleId } from './access-rules'

export type AdminTaskId = 'plants' | 'reception' | 'sales' | 'administration'
export interface AdminTask { id: AdminTaskId; label: string; modules: AdminModuleId[] }

// Presentation only: callers supply the existing authorized modules and the
// server's reception permission. This never grants access to a module.
export function adminTasks(authorized: readonly AdminModuleId[], canReceive: boolean): AdminTask[] {
  const definitions: AdminTask[] = [
    { id: 'plants', label: 'Plantas', modules: ['inventario', 'stock'] },
    { id: 'reception', label: 'Recepción', modules: canReceive ? ['compras'] : [] },
    { id: 'sales', label: 'Ventas', modules: ['ventas', 'pedidos', 'promociones'] },
    { id: 'administration', label: 'Administración', modules: ['personal', 'sucursales', 'clientes', 'boletin', ...(!canReceive ? ['compras' as const] : [])] },
  ]
  return definitions.map(task => ({ ...task, modules: task.modules.filter(id => authorized.includes(id)) })).filter(task => task.modules.length)
}

export const adminTaskModuleLabel: Partial<Record<AdminModuleId, string>> = {
  inventario: 'Plantas', stock: 'Inventario', compras: 'Compras y proveedores',
  ventas: 'Reportes de ventas', pedidos: 'Pedidos web', promociones: 'Promociones',
}
