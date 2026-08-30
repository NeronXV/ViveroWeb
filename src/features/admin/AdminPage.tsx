import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'

import { useDemoStore } from '../../app/providers/DemoStore'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { AccessDenied } from '../access/AccessDenied'
import { hasCapability } from '../access/access-helpers'
import { ADMIN_MODULE_RULES, getAuthorizedAdminModules, type AdminModuleId } from '../access/access-rules'
import type { UserAccessContext } from '../access/access-types'
import { useAuth } from '../auth/useAuth'
import { BranchDirectory, StaffDirectory } from './AdminDirectories'
import { AdminInventory } from './AdminInventory'
import { useAdminReports } from './useAdminReports'
import { useAdminBranches } from './useAdminDirectories'
import { AdminCatalog } from './AdminCatalog'
import { AdminCustomers } from './AdminCustomers'

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
  const { plants, orders, setDiscount } = useDemoStore()
  const [notice, setNotice] = useState('')
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    if (await signOut()) {
      navigate('/login', { replace: true })
    }
  }


  const canViewAllSales = hasCapability(context, 'VIEW_ALL_SALES')
  const canViewReports = hasCapability(context, 'VIEW_REPORTS')
  const canAssignRoles = hasCapability(context, 'ASSIGN_ROLES')

  const headingRef = useHeadingFocus<HTMLHeadingElement>(context.userId)
  useDocumentTitle('Administración')

  // Cargar sucursales si tiene permisos globales para filtrar
  const branchesDir = useAdminBranches(canViewAllSales)

  // Hook de reportes reales de Supabase
  const {
    dailySales,
    topProducts,
    isLoading: isReportsLoading,
    isError: isReportsError,
    errorMsg: reportsErrorMsg,
    startDate,
    endDate,
    selectedBranchId,
    setStartDate,
    setEndDate,
    setSelectedBranchId,
    refresh: refreshReports,
  } = useAdminReports(context.branch?.id ?? null)

  useEffect(() => {
    const nextTab = requestedTab && authorizedTabs.includes(requestedTab) ? requestedTab : authorizedTabs[0]
    if (nextTab) setTab(nextTab)
  }, [authorizedTabs, context.userId, requestedTab])


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

  // Cálculos acumulativos reales en centavos para el Stats-Grid de Ventas
  const totalRevenueReal = dailySales.reduce((sum, item) => sum + item.revenueCents, 0) / 100
  const totalSalesCountReal = dailySales.reduce((sum, item) => sum + item.salesCount, 0)
  const averageTicketReal = totalSalesCountReal > 0 ? totalRevenueReal / totalSalesCountReal : 0
  const totalDiscountsReal = dailySales.reduce((sum, item) => sum + item.discountCents, 0) / 100

  return (
    <main className="internal-page">
      <div className="dashboard-panel open embedded">
        <div className="dashboard-header">
          <div className="dashboard-title-area">
            <span className="dashboard-brand-mark" aria-hidden="true">VD</span>
            <div>
              <p className="dashboard-kicker">Administración interna</p>
              <h2 ref={headingRef} tabIndex={-1}>Panel Vivero Dulcinea</h2>
              <p className="demo-copy">Módulos reales y demostrativos claramente identificados.</p>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <span className="role-badge-db admin">Mixto</span>
            <Link className="logout-btn" to="/panel">Volver al panel</Link>
            <button type="button" className="logout-btn" onClick={onRefreshAccess}>Actualizar acceso</button>
            <button type="button" className="logout-btn" onClick={handleSignOut}>Cerrar sesión</button>
          </div>
        </div>

        <div className="dashboard-body">
          <aside className="dashboard-sidebar">
            <nav aria-label="Módulos administrativos">
              <ul role="tablist" aria-orientation="vertical">
                {ADMIN_MODULE_RULES.map((item) => {
                  const authorized = authorizedTabs.includes(item.id)
                  const explanation = item.pendingBackendPermission ? 'Pendiente de permiso backend' : 'No disponible con tus capacidades actuales'
                  return (
                    <li key={item.id} role="presentation">
                      <button
                        id={`admin-tab-${item.id}`}
                        type="button"
                        role="tab"
                        className={`db-nav-item ${tab === item.id ? 'active' : ''}`}
                        onClick={() => selectTab(item.id)}
                        onKeyDown={(event) => navigateTabs(event, item.id)}
                        disabled={!authorized}
                        aria-disabled={!authorized}
                        aria-selected={authorized && tab === item.id}
                        aria-controls={authorized ? `admin-panel-${item.id}` : undefined}
                        tabIndex={authorized && tab === item.id ? 0 : -1}
                        title={!authorized ? explanation : undefined}
                      >
                        {item.label}
                        {!authorized && <span className="module-lock-reason">{explanation}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </aside>

          <section className="dashboard-content">
            {notice && <p className="form-notice" aria-live="polite">{notice}</p>}
            <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`} tabIndex={0}>

              {tab === 'sucursales' && authorizedTabs.includes('sucursales') && <BranchDirectory active />}

              {tab === 'inventario' && authorizedTabs.includes('inventario') && (
                <AdminCatalog
                  active={tab === 'inventario'}
                  onContinueToInventory={authorizedTabs.includes('stock') ? () => selectTab('stock') : undefined}
                />
              )}

              {tab === 'stock' && authorizedTabs.includes('stock') && (
                <AdminInventory
                  active
                  branchName={context.branch?.name ?? 'Sin sucursal asignada'}
                  onManageProducts={authorizedTabs.includes('inventario') ? () => selectTab('inventario') : undefined}
                />
              )}

              {tab === 'promociones' && authorizedTabs.includes('promociones') && (
                <section className="db-tab-content active">
                  <h3>Promociones</h3>
                  <p className="demo-copy">Promociones exclusivamente demostrativas.</p>
                  <form className="dashboard-form" onSubmit={savePromotion}>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="promo-plant">Producto</label>
                        <select id="promo-plant" name="plantId">
                          {plants.map((plant) => <option value={plant.id} key={plant.id}>{plant.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="promo-discount">Descuento (%)</label>
                        <input id="promo-discount" name="discount" type="number" min="0" max="90" required />
                      </div>
                    </div>
                    <button className="submit-db-btn">Aplicar promoción demo</button>
                  </form>
                  <DataTable headings={['Producto', 'Precio', 'Descuento']} rows={plants.filter(({ discount }) => discount > 0).map((plant) => [plant.name, `$${plant.price.toFixed(2)}`, `${plant.discount}%`])} />
                </section>
              )}

              {tab === 'ventas' && authorizedTabs.includes('ventas') && (
                <section className="db-tab-content active">
                  <div className="section-header-row">
                    <h3>Ventas y Reportes Reales</h3>
                    <button type="button" className="refresh-btn-secondary" onClick={refreshReports} disabled={isReportsLoading}>
                      {isReportsLoading ? 'Cargando...' : '↻ Actualizar'}
                    </button>
                  </div>

                  {/* Panel de Controles y Filtros */}
                  <div className="dashboard-filters-card">
                    <div className="filters-grid">
                      <div className="form-group">
                        <label htmlFor="filter-start-date">Fecha Inicio</label>
                        <input
                          id="filter-start-date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={isReportsLoading}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="filter-end-date">Fecha Fin</label>
                        <input
                          id="filter-end-date"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          disabled={isReportsLoading}
                        />
                      </div>
                      {canViewAllSales && (
                        <div className="form-group">
                          <label htmlFor="filter-branch-select">Sucursal</label>
                          <select
                            id="filter-branch-select"
                            value={selectedBranchId || ''}
                            onChange={(e) => setSelectedBranchId(e.target.value || null)}
                            disabled={isReportsLoading || branchesDir.status === 'loading'}
                          >
                            <option value="">Todas las Sucursales</option>
                            {branchesDir.items.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} ({b.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado de Carga y Errores */}
                  {isReportsLoading && dailySales.length === 0 && (
                    <div className="cashier-status-container" role="status">
                      <div className="loading-spinner" />
                      <p>Generando reportes a partir de transacciones de Supabase...</p>
                    </div>
                  )}

                  {isReportsError && (
                    <div className="cashier-status-container error" role="alert">
                      <p className="error-copy">{reportsErrorMsg}</p>
                      <button type="button" className="retry-btn-primary" onClick={refreshReports}>
                        Reintentar cargar reportes
                      </button>
                    </div>
                  )}

                  {/* Renderizar Métricas y Tablas Reales */}
                  {!isReportsError && (!isReportsLoading || dailySales.length > 0) && (
                    <div className="reports-real-content">
                      {/* Stats Grid de Métricas Consolidadas */}
                      {canViewReports ? (
                        <div className="stats-grid">
                          <Stat label="Ingresos" value={`$${totalRevenueReal.toFixed(2)} MXN`} />
                          <Stat label="Descuentos Otorgados" value={`$${totalDiscountsReal.toFixed(2)} MXN`} />
                          <Stat label="Transacciones" value={String(totalSalesCountReal)} />
                          <Stat label="Ticket Promedio" value={`$${averageTicketReal.toFixed(2)} MXN`} />
                        </div>
                      ) : (
                        <p className="module-permission-note">No tienes el permiso VIEW_REPORTS para visualizar las métricas de ingresos.</p>
                      )}

                      {/* Tablas de Reportes */}
                      <div className="reports-tables-layout">
                        {/* Tabla 1: Reporte Diario de Ventas */}
                        <div className="report-table-section">
                          <h4>Historial Diario de Ventas (PAID)</h4>
                          <DataTable
                            headings={['Fecha', 'Sucursal', 'Ventas', 'Descuentos', 'Ingresos']}
                            rows={dailySales.map((item) => {
                              const dateStr = new Date(item.day).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                timeZone: 'UTC',
                              })
                              return [
                                dateStr,
                                item.branchName,
                                String(item.salesCount),
                                `$${(item.discountCents / 100).toFixed(2)}`,
                                `$${(item.revenueCents / 100).toFixed(2)}`,
                              ]
                            })}
                          />
                        </div>

                        {/* Tabla 2: Productos Más Vendidos */}
                        <div className="report-table-section">
                          <h4>Top 10 Productos Más Vendidos</h4>
                          <DataTable
                            headings={['Código', 'Producto', 'Cantidad Vendida', 'Ingreso Total']}
                            rows={topProducts.map((p) => [
                              p.productCode,
                              p.productName,
                              String(p.totalQuantity),
                              `$${(p.totalRevenueCents / 100).toFixed(2)}`,
                            ])}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {tab === 'pedidos' && authorizedTabs.includes('pedidos') && (
                <section className="db-tab-content active">
                  <h3>Pedidos</h3>
                  <p className="demo-copy">Datos de demostración guardados localmente.</p>
                  <DataTable headings={['Pedido', 'Fecha', 'Artículos', 'Total', 'Estado']} rows={orders.map((order) => [order.id, order.createdAt, order.items.map((item) => `${item.name} ×${item.quantity}`).join(', '), `$${order.total.toFixed(2)}`, order.status])} />
                </section>
              )}

              {tab === 'personal' && authorizedTabs.includes('personal') && <StaffDirectory active canAssignRoles={canAssignRoles} />}
              {tab === 'clientes' && authorizedTabs.includes('clientes') && <AdminCustomers active={tab === 'clientes'} />}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article className="stat-card"><span className="stat-icon">●</span><div><h4>{label}</h4><p>{value}</p></div></article>
}

function DataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return <div className="table-responsive"><table className="db-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length}>Sin información registrada para este período.</td></tr>}</tbody></table></div>
}
