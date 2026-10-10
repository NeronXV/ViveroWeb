import { describe, expect, it } from 'vitest'
import { adminTasks } from './admin-navigation'
import type { AdminModuleId } from './access-rules'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AdminNavigation } from '../admin/AdminNavigation'

const modules: AdminModuleId[] = ['inventario', 'stock', 'compras', 'ventas', 'pedidos', 'promociones', 'personal', 'sucursales', 'clientes', 'boletin']
const markup = (tab: AdminModuleId, authorized = modules, canCashier = false) => renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(AdminNavigation, { authorized, tab, canCashier, onSelect: () => {} })))
describe('administrative task navigation', () => {
  it('keeps purchases in reception independently of permission to execute a reception', () => {
    expect(adminTasks(['inventario', 'stock', 'compras']).map(t => t.id)).toEqual(['plants', 'reception'])
    expect(adminTasks(['compras'])[0].modules).toEqual(['compras'])
  })
  it('preserves every authorized implemented module exactly once', () => {
    const grouped = adminTasks(modules).flatMap(task => task.modules)
    expect(grouped.slice().sort()).toEqual(modules.slice().sort())
    expect(new Set(grouped).size).toBe(modules.length)
    expect(adminTasks([])).toEqual([])
  })
  it('keeps all secondary options present while marking precisely the selected module', () => {
    for (const tab of modules) {
      const html = markup(tab)
      for (const id of modules) expect(html).toContain(`id="admin-tab-${id}"`)
      expect(html.match(/aria-current="page"/g)).toHaveLength(1)
      expect(html).toContain(`id="admin-tab-${tab}" aria-current="page"`)
      expect(html).toContain(`admin-task-group active`)
    }
  })
  it('omits unauthorized destinations and offers cashier only with effective access', () => {
    const html = markup('inventario', ['inventario'])
    expect(html).not.toContain('admin-tab-stock')
    expect(html).not.toContain('admin-task-sales')
    expect(html).not.toContain('href="/caja"')
    expect(markup('inventario', ['inventario'], true)).toContain('href="/caja"')
  })
})
