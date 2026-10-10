import { describe, expect, it } from 'vitest'
import { adminTasks } from './admin-navigation'
import type { AdminModuleId } from './access-rules'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminNavigation } from '../admin/AdminNavigation'

describe('administrative task navigation', () => {
  it('keeps daily plant tools together without a reception entry for a manager', () => {
    const tasks = adminTasks(['inventario', 'stock', 'compras'], false)
    expect(tasks.map(task => task.label)).toEqual(['Plantas', 'Administración'])
    expect(tasks[0].modules).toEqual(['inventario', 'stock'])
    expect(tasks[1].modules).toEqual(['compras'])
  })
  it('exposes reception only with the effective server permission and existing module access', () => {
    expect(adminTasks(['inventario'], true).some(task => task.id === 'reception')).toBe(false)
    expect(adminTasks(['compras'], true)).toEqual([{ id: 'reception', label: 'Recepción', modules: ['compras'] }])
  })
  it('preserves every implemented authorized module exactly once, without granting others', () => {
    const modules: AdminModuleId[] = ['inventario', 'stock', 'compras', 'ventas', 'pedidos', 'promociones', 'personal', 'sucursales', 'clientes', 'boletin']
    for (const receive of [true, false]) {
      const grouped = adminTasks(modules, receive).flatMap(task => task.modules)
      expect(grouped.slice().sort()).toEqual(modules.slice().sort())
      expect(new Set(grouped).size).toBe(modules.length)
    }
    expect(adminTasks([], true)).toEqual([])
  })
  it('avoids repeating the open module and keeps inventory as a secondary tool', () => {
    const html = renderToStaticMarkup(createElement(AdminNavigation, {
      authorized: ['inventario', 'stock'], tab: 'inventario', canReceive: false, onSelect: () => {},
    }))
    expect(html).not.toContain('id="admin-tab-inventario"')
    expect(html).toContain('id="admin-tab-stock"')
    expect(html).toContain('Inventario')
    expect(html).toContain('Herramientas de plantas')
    expect(html).not.toContain('Recepción')
  })
  it('omits an empty tools menu without losing the authorized task', () => {
    const html = renderToStaticMarkup(createElement(AdminNavigation, {
      authorized: ['compras'], tab: 'compras', canReceive: true, onSelect: () => {},
    }))
    expect(html).toContain('Recepción')
    expect(html).not.toContain('admin-options-toggle')
    expect(html).not.toContain('id="admin-tab-compras"')
  })
})
