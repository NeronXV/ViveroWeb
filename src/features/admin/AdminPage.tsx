import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useDemoStore } from '../../app/providers/DemoStore'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { DemoBanner } from '../../components/feedback/DemoBanner'
import type { PlantCategory } from '../../types/domain'
import { AccessDenied } from '../access/AccessDenied'
import { hasCapability } from '../access/access-helpers'
import { ADMIN_MODULE_RULES, getAuthorizedAdminModules, type AdminModuleId } from '../access/access-rules'
import type { UserAccessContext } from '../access/access-types'
import { useAuth } from '../auth/useAuth'

export function AdminPage() {
  const { accessContext, refreshAccessContext } = useAuth()
  const authorizedTabs = useMemo(() => getAuthorizedAdminModules(accessContext), [accessContext])

  if (!accessContext || authorizedTabs.length === 0) {
    return <AccessDenied reason="No hay módulos administrativos disponibles para tu cuenta." />
  }

  return <AuthorizedAdminPage context={accessContext} authorizedTabs={authorizedTabs} onRefreshAccess={refreshAccessContext} />
}

function AuthorizedAdminPage({ context, authorizedTabs, onRefreshAccess }: { context: UserAccessContext; authorizedTabs: AdminModuleId[]; onRefreshAccess: () => void }) {
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as AdminModuleId | null
  const firstAuthorizedTab = authorizedTabs[0]
  const [tab, setTab] = useState<AdminModuleId>(() => requestedTab && authorizedTabs.includes(requestedTab) ? requestedTab : firstAuthorizedTab)
  const { plants, orders, staff, addPlant, setDiscount, restock, toggleStaff } = useDemoStore()
  const [notice, setNotice] = useState('')
  const canManagePrices = hasCapability(context, 'MANAGE_PRICES')
  const canViewBranchSales = hasCapability(context, 'VIEW_BRANCH_SALES')
  const canViewAllSales = hasCapability(context, 'VIEW_ALL_SALES')
  const canViewReports = hasCapability(context, 'VIEW_REPORTS')
  const canManageUsers = hasCapability(context, 'MANAGE_USERS')
  const canAssignRoles = hasCapability(context, 'ASSIGN_ROLES')
  const revenue = orders.reduce((sum, order) => sum + order.total, 0)
  const headingRef = useHeadingFocus<HTMLHeadingElement>(context.userId)
  useDocumentTitle('Administración')

  useEffect(() => {
    const nextTab = requestedTab && authorizedTabs.includes(requestedTab) ? requestedTab : authorizedTabs[0]
    if (nextTab) setTab(nextTab)
  }, [authorizedTabs, context.userId, requestedTab])

  const createPlant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canManagePrices) {
      setNotice('Necesitas permiso para gestionar precios antes de agregar este producto demo.')
      return
    }
    const data = new FormData(event.currentTarget)
    addPlant({ name: String(data.get('name')), category: String(data.get('category')) as PlantCategory, price: Number(data.get('price')), light: 'media', water: 'alta', pets: true, image: plants[0].image, lightDesc: 'Luz indirecta', waterDesc: 'Riego moderado', petDesc: 'Segura para mascotas', description: String(data.get('description')), stock: Number(data.get('stock')) })
    event.currentTarget.reset()
    setNotice('Producto de demostración agregado localmente.')
  }

  const savePromotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setDiscount(Number(data.get('plantId')), Number(data.get('discount')))
    setNotice('Promoción de demostración actualizada.')
  }

  const selectTab = (nextTab: AdminModuleId) => {
    if (!authorizedTabs.includes(nextTab)) return
    setTab(nextTab)
    setNotice('')
  }

  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, currentTab: AdminModuleId) => {
    const currentIndex = authorizedTabs.indexOf(currentTab)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % authorizedTabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + authorizedTabs.length) % authorizedTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = authorizedTabs.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextTab = authorizedTabs[nextIndex]
    selectTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`admin-tab-${nextTab}`)?.focus())
  }

  return <main className="internal-page"><div className="dashboard-panel open embedded"><div className="dashboard-header"><div><h2 ref={headingRef} tabIndex={-1}>Panel Vivero Dulcinea</h2><DemoBanner compact /></div><div className="dashboard-header-actions"><span className="role-badge-db admin">Demo</span><button type="button" className="logout-btn" onClick={onRefreshAccess}>Actualizar acceso</button><Link className="logout-btn" to="/login">Sesión y acceso</Link></div></div><div className="dashboard-body"><aside className="dashboard-sidebar"><nav aria-label="Módulos administrativos"><ul role="tablist" aria-orientation="vertical">{ADMIN_MODULE_RULES.map((item) => {
    const authorized = authorizedTabs.includes(item.id)
    const explanation = item.pendingBackendPermission ? 'Pendiente de permiso backend' : 'No disponible con tus capacidades actuales'
    return <li key={item.id} role="presentation"><button id={`admin-tab-${item.id}`} type="button" role="tab" className={`db-nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => selectTab(item.id)} onKeyDown={(event) => navigateTabs(event, item.id)} disabled={!authorized} aria-disabled={!authorized} aria-selected={authorized && tab === item.id} aria-controls={authorized ? `admin-panel-${item.id}` : undefined} tabIndex={authorized && tab === item.id ? 0 : -1} title={!authorized ? explanation : undefined}>{item.label}{!authorized && <span className="module-lock-reason">{explanation}</span>}</button></li>
  })}</ul></nav></aside><section className="dashboard-content"><p className="form-notice" aria-live="polite">{notice}</p><div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`} tabIndex={0}>
    {tab === 'inventario' && authorizedTabs.includes('inventario') && <section className="db-tab-content active"><h3>Agregar producto</h3><p className="demo-copy">Todos los cambios de este módulo permanecen en datos demostrativos locales.</p><form className="dashboard-form" onSubmit={createPlant}><div className="form-row"><div className="form-group"><label htmlFor="plant-name">Nombre</label><input id="plant-name" name="name" required /></div><div className="form-group"><label htmlFor="plant-category">Categoría</label><select id="plant-category" name="category"><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="suculentas">Suculentas</option></select></div></div><div className="form-row"><div className="form-group"><label htmlFor="plant-price">Precio</label><input id="plant-price" name="price" type="number" min="0.1" step="0.01" disabled={!canManagePrices} required /></div><div className="form-group"><label htmlFor="plant-stock">Existencias</label><input id="plant-stock" name="stock" type="number" min="0" required /></div></div>{!canManagePrices && <p className="module-permission-note">La edición de precios está deshabilitada porque requiere MANAGE_PRICES.</p>}<div className="form-group"><label htmlFor="plant-description">Descripción</label><textarea id="plant-description" name="description" required /></div><button className="submit-db-btn" disabled={!canManagePrices}>Agregar producto demo</button></form></section>}
    {tab === 'stock' && authorizedTabs.includes('stock') && <section className="db-tab-content active"><h3>Control de inventario</h3><p className="demo-copy">Inventario exclusivamente demostrativo.</p><div className="db-stock-grid">{plants.map((plant) => <article key={plant.id} className={`stock-card ${plant.stock <= 1 ? 'critical' : plant.stock <= 4 ? 'low' : 'adequate'}`}><div className="stock-card-image-container"><img src={plant.image} alt={plant.name} className="stock-card-img-large" /><span className="stock-badge-floating">{plant.stock <= 1 ? '🔴 Crítico' : plant.stock <= 4 ? '🟡 Bajo' : '🟢 Adecuado'}</span></div><div className="stock-card-body"><h4>{plant.name}</h4><p>{plant.stock} unidades · Datos de demostración</p><div className="stock-action-group"><button className="stock-btn" onClick={() => restock(plant.id, 5)}>+5 u.</button><button className="stock-btn" onClick={() => restock(plant.id, 10)}>+10 u.</button></div></div></article>)}</div></section>}
    {tab === 'promociones' && authorizedTabs.includes('promociones') && <section className="db-tab-content active"><h3>Promociones</h3><p className="demo-copy">Promociones exclusivamente demostrativas.</p><form className="dashboard-form" onSubmit={savePromotion}><div className="form-row"><div className="form-group"><label htmlFor="promo-plant">Producto</label><select id="promo-plant" name="plantId">{plants.map((plant) => <option value={plant.id} key={plant.id}>{plant.name}</option>)}</select></div><div className="form-group"><label htmlFor="promo-discount">Descuento (%)</label><input id="promo-discount" name="discount" type="number" min="0" max="90" required /></div></div><button className="submit-db-btn">Aplicar promoción demo</button></form><DataTable headings={['Producto', 'Precio', 'Descuento']} rows={plants.filter(({ discount }) => discount > 0).map((plant) => [plant.name, `$${plant.price.toFixed(2)}`, `${plant.discount}%`])} /></section>}
    {tab === 'ventas' && authorizedTabs.includes('ventas') && <section className="db-tab-content active"><h3>Ventas y reportes</h3><DemoBanner compact />{(canViewBranchSales || canViewAllSales) && <div><h4>{canViewAllSales ? 'Ventas globales demo' : 'Ventas de sucursal demo'}</h4><DataTable headings={['Pedido', 'Fecha', 'Total', 'Estado']} rows={orders.map((order) => [order.id, order.createdAt, `$${order.total.toFixed(2)}`, order.status])} /></div>}{canViewReports && <div><h4>Métricas demostrativas</h4><div className="stats-grid"><Stat label="Ingresos demo" value={`$${revenue.toFixed(2)}`} /><Stat label="Pedidos demo" value={String(orders.length)} /><Stat label="Ticket promedio demo" value={`$${orders.length ? (revenue / orders.length).toFixed(2) : '0.00'}`} /></div></div>}</section>}
    {tab === 'pedidos' && authorizedTabs.includes('pedidos') && <section className="db-tab-content active"><h3>Pedidos</h3><p className="demo-copy">Datos de demostración guardados localmente.</p><DataTable headings={['Pedido', 'Fecha', 'Artículos', 'Total', 'Estado']} rows={orders.map((order) => [order.id, order.createdAt, order.items.map((item) => `${item.name} ×${item.quantity}`).join(', '), `$${order.total.toFixed(2)}`, order.status])} /></section>}
    {tab === 'personal' && authorizedTabs.includes('personal') && <section className="db-tab-content active"><h3>Personal y roles</h3>{canManageUsers && <div><p className="demo-copy">Personal exclusivamente demostrativo.</p><div className="table-responsive"><table className="db-table"><thead><tr><th>Nombre</th><th>Especialidad</th><th>Turno</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{staff.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.specialty}</td><td>{member.shift}</td><td>{member.active ? 'Activo (demo)' : 'Inactivo (demo)'}</td><td><button className="staff-action-btn" onClick={() => toggleStaff(member.id)}>Alternar turno</button></td></tr>)}</tbody></table></div></div>}{canAssignRoles && <section className="role-assignment-placeholder"><h4>Asignación de roles</h4><p className="demo-copy">Capacidad reconocida. La edición continúa deshabilitada hasta una fase backend posterior.</p></section>}</section>}
  </div></section></div></div></main>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article className="stat-card"><span className="stat-icon">●</span><div><h4>{label}</h4><p>{value}</p></div></article>
}

function DataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return <div className="table-responsive"><table className="db-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length}>Sin datos de demostración todavía.</td></tr>}</tbody></table></div>
}
