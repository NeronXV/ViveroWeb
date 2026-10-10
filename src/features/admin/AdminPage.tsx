import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { AccessDenied } from '../access/AccessDenied'
import { hasCapability } from '../access/access-helpers'
import { ADMIN_MODULE_RULES, canEnterCashier, getAuthorizedAdminModules, type AdminModuleId } from '../access/access-rules'
import type { UserAccessContext } from '../access/access-types'
import { useAuth } from '../auth/useAuth'
import { BranchDirectory, StaffDirectory } from './AdminDirectories'
import { AdminInventory } from './AdminInventory'
import { useAdminReports } from './useAdminReports'
import { useAdminBranches } from './useAdminDirectories'
import { AdminPlants } from './plants/AdminPlants'
import { AdminNavigation } from './AdminNavigation'
import { adminTasks } from '../access/admin-navigation'
import './admin-navigation.css'
import { AdminCustomers } from './AdminCustomers'
import { AdminPromotions } from './AdminPromotions'
import { StaffInvitation } from './StaffInvitation'
import { AdminNewsletter } from '../newsletter/AdminNewsletter'
import { AdminOrders } from './AdminOrders'
import { PurchasesDashboard } from './purchases'
import { useDemoStore } from '../../app/providers/DemoStore'
import logo from '../../assets/isotipo-flor.svg'

function AdminSessionActions({ compact, role, children }: { compact: boolean; role: string; children: ReactNode }) {
  const actions = <div className="dashboard-header-actions">{children}</div>
  return compact ? <details className="admin-session-menu"><summary title={role}>Mi sesión</summary>{actions}</details> : actions
}

export function AdminPage() {
  const { accessContext, refreshAccessContext } = useAuth()
  const authorizedTabs = useMemo(() => getAuthorizedAdminModules(accessContext), [accessContext])

  if (!accessContext || authorizedTabs.length === 0) {
    return <AccessDenied reason="No hay módulos administrativos disponibles para tu cuenta." />
  }

  return <AuthorizedAdminPage context={accessContext} authorizedTabs={authorizedTabs} onRefreshAccess={refreshAccessContext} />
}

function AuthorizedAdminPage({ context, authorizedTabs, onRefreshAccess }: { context: UserAccessContext; authorizedTabs: AdminModuleId[]; onRefreshAccess: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as AdminModuleId | null
  const firstAuthorizedTab = authorizedTabs.includes('inventario') ? 'inventario' : authorizedTabs[0]
  const tab = requestedTab && authorizedTabs.includes(requestedTab) ? requestedTab : firstAuthorizedTab
  const [preselectedStockProductId, setPreselectedStockProductId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const { darkTheme, toggleTheme } = useDemoStore()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const canCashier = canEnterCashier(context)
  const activeTask = adminTasks(authorizedTabs, canCashier).find(task => task.modules.includes(tab))
  const plantWork = useRef({ dirty: false, busy: false })
  const allowSessionAction = () => {
    if (tab !== 'inventario') return true
    if (plantWork.current.busy) { setNotice('Espera a que termine la operación antes de cambiar tu sesión.'); return false }
    return !plantWork.current.dirty || window.confirm('Tienes cambios de la planta sin guardar. ¿Quieres descartarlos y continuar con esta acción de sesión?')
  }

  const handleSignOut = async () => {
    if (!allowSessionAction()) return
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

  // Hook de reportes reales de MariaDB
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

  const selectTab = (nextTab: AdminModuleId) => {
    if (!authorizedTabs.includes(nextTab)) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    next.delete('plant'); next.delete('view')
    setSearchParams(next)
    setNotice('')
  }

  // Cálculos acumulativos reales en centavos para el Stats-Grid de Ventas
  const totalRevenueReal = dailySales.reduce((sum, item) => sum + item.revenueCents, 0) / 100
  const totalSalesCountReal = dailySales.reduce((sum, item) => sum + item.salesCount, 0)
  const averageTicketReal = totalSalesCountReal > 0 ? totalRevenueReal / totalSalesCountReal : 0
  const totalDiscountsReal = dailySales.reduce((sum, item) => sum + item.discountCents, 0) / 100

  return (
    <main className="internal-page admin-workspace admin-task-shell">
      <div className="dashboard-panel open embedded">
        <div className="dashboard-header">
          <div className="dashboard-title-area">
            <span className="dashboard-brand-mark" aria-hidden="true">VD</span>
            <div>
              <p className="dashboard-kicker">Administración interna</p>
              <h2 ref={headingRef} tabIndex={-1}>Vivero Dulcinea</h2>
              <p className="demo-copy">Gestión de productos, pedidos y operación de sucursal.</p>
            </div>
          </div>
          <AdminSessionActions compact role={context.role?.displayName ?? 'Administración'}>
            <button
              type="button"
              className="theme-toggle-btn-admin"
              onClick={toggleTheme}
              aria-label={darkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={darkTheme ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {darkTheme ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <span className="role-badge-db admin">{context.role?.displayName ?? 'Administración'}</span>
            <Link className="logout-btn" to="/panel">Volver al panel</Link>
            <button type="button" className="logout-btn" onClick={() => { if (allowSessionAction()) onRefreshAccess() }}>Actualizar acceso</button>
            <button type="button" className="logout-btn" onClick={handleSignOut}>Cerrar sesión</button>
          </AdminSessionActions>
        </div>

        <div className="dashboard-body">
          <aside className="dashboard-sidebar">
            <Link to="/panel" className="admin-sidebar-brand">
              <img src={logo} alt="" />
              <span>Vivero Dulcinea<small>Administración</small></span>
            </Link>
            <p className="admin-nav-caption">Tu vivero, en orden</p>
            <AdminNavigation authorized={authorizedTabs} tab={tab} canCashier={canCashier} onSelect={selectTab} />
            <div className="admin-sidebar-context">
              <span>Sucursal</span>
              <strong>{context.branch?.name ?? 'Sin sucursal asignada'}</strong>
              <Link to="/">Ver sitio del vivero ↗</Link>
            </div>
          </aside>

          <section className="dashboard-content">
            <div className="admin-content-context">
              <span>Administración / {ADMIN_MODULE_RULES.find((item) => item.id === tab)?.label.replace(/^[^\p{L}\p{N}]+/u, '')}</span>
              <span>Vivero Dulcinea</span>
            </div>
            {notice && <p className="form-notice" aria-live="polite">{notice}</p>}
            <div id="admin-task-panel" role="region" aria-labelledby={`admin-task-${activeTask?.id}`}>

              {tab === 'sucursales' && authorizedTabs.includes('sucursales') && <BranchDirectory active />}

              {tab === 'inventario' && authorizedTabs.includes('inventario') && (
                <AdminPlants
                  onWorkingState={(dirty, busy) => { plantWork.current = { dirty, busy } }}
                  onReception={authorizedTabs.includes('compras') ? () => selectTab('compras') : undefined}
                  onInventory={authorizedTabs.includes('stock') ? (productId?: string) => {
                    if (productId) setPreselectedStockProductId(productId)
                    selectTab('stock')
                  } : undefined}
                />
              )}

              {tab === 'stock' && authorizedTabs.includes('stock') && (
                <AdminInventory
                  active
                  branchName={context.branch?.name ?? 'Sin sucursal asignada'}
                  initialProductId={preselectedStockProductId}
                  onClearInitialProductId={() => setPreselectedStockProductId(null)}
                  onManageProducts={authorizedTabs.includes('inventario') ? () => selectTab('inventario') : undefined}
                />
              )}

              {tab === 'compras' && authorizedTabs.includes('compras') && (
                <PurchasesDashboard
                  active={tab === 'compras'}
                  branch={context.branch}
                  onNavigateToCatalog={authorizedTabs.includes('inventario') ? () => selectTab('inventario') : undefined}
                />
              )}

              {tab === 'promociones' && authorizedTabs.includes('promociones') && (
                <AdminPromotions active />
              )}

              {tab === 'ventas' && authorizedTabs.includes('ventas') && (
                <section className="db-tab-content active">
                  <div className="section-header-row">
                    <div><h3>Ventas y reportes</h3><p className="tab-desc">Importes cobrados antes de devoluciones. Consulta los ajustes por devolución en los cortes de Caja.</p></div>
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
                      <p>Generando reportes a partir de transacciones de MariaDB...</p>
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
                        <div className="stock-kpi-bar">
                          <Stat
                            label="Ingresos Totales"
                            value={`$${totalRevenueReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`}
                            icon="💰"
                            iconBg="rgba(16, 185, 129, 0.15)"
                            iconColor="#10b981"
                          />
                          <Stat
                            label="Descuentos Otorgados"
                            value={`$${totalDiscountsReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`}
                            icon="🏷️"
                            iconBg="rgba(239, 68, 68, 0.15)"
                            iconColor="#ef4444"
                          />
                          <Stat
                            label="Transacciones Realizadas"
                            value={String(totalSalesCountReal)}
                            icon="🧾"
                            iconBg="rgba(59, 130, 246, 0.15)"
                            iconColor="#3b82f6"
                          />
                          <Stat
                            label="Ticket Promedio"
                            value={`$${averageTicketReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`}
                            icon="📈"
                            iconBg="rgba(139, 92, 246, 0.15)"
                            iconColor="#8b5cf6"
                          />
                        </div>
                      ) : (
                        <p className="module-permission-note">No tienes el permiso VIEW_REPORTS para visualizar las métricas de ingresos.</p>
                      )}

                      {/* Tablas de Reportes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.25rem' }}>
                        {/* Tabla 1: Reporte Diario de Ventas */}
                        <div className="botanical-section-card">
                          <div className="botanical-section-header">
                            <span>📅</span>
                            <h4>Historial Diario de Ventas (PAID)</h4>
                          </div>
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
                                `$${(item.discountCents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                                `$${(item.revenueCents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              ]
                            })}
                          />
                        </div>

                        {/* Tabla 2: Productos Más Vendidos */}
                        <div className="botanical-section-card">
                          <div className="botanical-section-header">
                            <span>🏆</span>
                            <h4>Top 10 Productos Más Vendidos</h4>
                          </div>
                          <DataTable
                            headings={['Código', 'Producto', 'Cantidad Vendida', 'Ingreso Total']}
                            rows={topProducts.map((p) => [
                              p.productCode,
                              p.productName,
                              String(p.totalQuantity),
                              `$${(p.totalRevenueCents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            ])}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {tab === 'boletin' && authorizedTabs.includes('boletin') && <AdminNewsletter />}
              {tab === 'pedidos' && authorizedTabs.includes('pedidos') && (
                <AdminOrders active={tab === 'pedidos'} />
              )}

              {tab === 'personal' && authorizedTabs.includes('personal') && <>{hasCapability(context, 'MANAGE_USERS') && <StaffInvitation />}<StaffDirectory active canAssignRoles={canAssignRoles} /></>}
              {tab === 'clientes' && authorizedTabs.includes('clientes') && <AdminCustomers active={tab === 'clientes'} />}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function Stat({
  label,
  value,
  icon,
  iconBg,
  iconColor,
}: {
  label: string
  value: string
  icon?: string
  iconBg?: string
  iconColor?: string
}) {
  return (
    <div className="stock-kpi-card">
      <div className="stock-kpi-icon" style={{ background: iconBg || 'rgba(16, 185, 129, 0.15)', color: iconColor || '#10b981' }}>
        {icon || '📊'}
      </div>
      <div className="stock-kpi-info">
        <span className="stock-kpi-value">{value}</span>
        <span className="stock-kpi-label">{label}</span>
      </div>
    </div>
  )
}

function DataTable({ headings, rows }: { headings: string[]; rows: string[][] }) {
  return (
    <div className="table-responsive">
      <table className="admin-table">
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={`${row[0]}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headings.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                Sin información registrada para este período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
