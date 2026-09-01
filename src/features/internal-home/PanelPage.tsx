import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { canEnterAdmin, canEnterCashier, canViewCatalog, getAuthorizedAdminModules, getWorkspaceTitle, ADMIN_MODULE_RULES } from '../access/access-rules'
import { getBranchState } from '../access/access-helpers'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import logo from '../../assets/isotipo-flor.svg'

function PanelModuleIcon({ type }: { type: 'catalog' | 'cashier' | 'admin' }) {
  return (
    <span className="panel-card-icon" aria-hidden="true">
      {type === 'catalog' ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 21V9m0 0C8 9 6 7 6 3c4 0 6 2 6 6Zm0 4c4 0 6-2 6-6-4 0-6 2-6 6ZM5 21h14" />
        </svg>
      ) : type === 'cashier' ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 5h2l1.5 9h9.8l1.7-6H7.2M9 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 20V9l8-5 8 5v11M8 20v-7h8v7M3 20h18" />
        </svg>
      )}
    </span>
  )
}

function PanelLoading({ title, subtitle }: { title: string; subtitle: string }) {
  useDocumentTitle(title)
  return (
    <main className="internal-page access-boundary-page">
      <section className="login-card" aria-busy="true">
        <p className="eyebrow">Acceso interno</p>
        <h1>{title}</h1>
        <p role="status" aria-live="polite">{subtitle}</p>
      </section>
    </main>
  )
}

export function PanelPage() {
  const { status, accessStatus, accessContext, accessError, signOut, refreshAccessContext, operationInProgress } = useAuth()
  const navigate = useNavigate()
  const headingRef = useHeadingFocus<HTMLHeadingElement>(`${status}:${accessStatus}`)

  useDocumentTitle('Panel de Acceso Interno')

  const handleSignOut = async () => {
    if (await signOut()) {
      navigate('/login', { replace: true })
    }
  }

  // 1. Verificando sesión
  if (status === 'initializing') {
    return <PanelLoading title="Verificando sesión" subtitle="Espera mientras confirmamos tu sesión local." />
  }

  // 2. Cargando contexto de acceso
  if (accessStatus === 'loading') {
    return <PanelLoading title="Cargando acceso" subtitle="Espera mientras cargamos tu perfil, rol y sucursal asignada." />
  }

  // 3. Error al cargar contexto de acceso
  if (accessStatus === 'error') {
    return (
      <main className="internal-page access-boundary-page">
        <section className="login-card" role="alert">
          <p className="eyebrow">Acceso interno</p>
          <h1 ref={headingRef} tabIndex={-1}>Error de acceso</h1>
          <p>{accessError ?? 'No fue posible cargar tu perfil o capacidades desde el servidor.'}</p>
          <div className="auth-session-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>
              Reintentar
            </button>
            <button type="button" className="submit-db-btn" onClick={handleSignOut} disabled={operationInProgress}>
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    )
  }

  // 4. Perfil inactivo o bloqueado
  const isProfileActive = accessContext?.accessState === 'ACTIVE'
  if (accessContext && !isProfileActive) {
    let explanation = 'Tu cuenta no tiene un perfil configurado en el sistema.'
    if (accessContext.accessState === 'PROFILE_INACTIVE') {
      explanation = 'Tu perfil se encuentra desactivado o inactivo.'
    } else if (accessContext.accessState === 'NO_ROLE') {
      explanation = 'Tu perfil no tiene un rol asignado en la base de datos.'
    }

    return (
      <main className="internal-page access-boundary-page">
        <section className="login-card">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img src={logo} alt="" className="logo-icon" style={{ height: '50px' }} />
          </div>
          <p className="eyebrow" style={{ color: 'var(--primary-light)' }}>Acceso restringido</p>
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: '1.8rem', margin: '0.5rem 0' }}>
            Perfil Inactivo o Bloqueado
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{explanation}</p>
          <div className="auth-session-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>
              Actualizar acceso
            </button>
            <button type="button" className="submit-db-btn" onClick={handleSignOut} disabled={operationInProgress}>
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    )
  }

  // 5. Sesión activa
  const showCashier = canEnterCashier(accessContext)
  const showAdmin = canEnterAdmin(accessContext)
  const showCatalog = canViewCatalog(accessContext)

  // Comprobar si el usuario tiene permiso de Caja pero está bloqueado por sucursal
  const hasCashierPermission = accessContext ? accessContext.capabilities.includes('OPERATE_CASHIER') : false
  const branchState = accessContext ? getBranchState(accessContext) : 'none'
  const cashierBlockedByBranch = hasCashierPermission && (branchState === 'none' || branchState === 'inactive')

  const authorizedAdminModules = accessContext ? getAuthorizedAdminModules(accessContext) : []

  const hasAnyModule = showCatalog || showCashier || showAdmin || cashierBlockedByBranch

  const handleOpenCashier = () => {
    if (showCashier) {
      navigate('/caja')
    }
  }

  const handleOpenAdmin = () => {
    if (showAdmin) {
      navigate('/admin')
    }
  }

  const handleOpenCatalog = () => navigate('/catalogo')

  return (
    <main className="internal-page">
      <div className="internal-shell">
        <div className="panel-header-section">
          <div className="panel-user-profile">
            <div className="panel-user-avatar">
              {(accessContext?.profile?.fullName ?? '?')[0].toUpperCase()}
            </div>
            <div className="panel-user-details">
              <p className="panel-welcome">{getWorkspaceTitle(accessContext)}</p>
              <h1 ref={headingRef} tabIndex={-1}>
                {accessContext?.profile?.fullName ?? 'Usuario'}
              </h1>
              <p>
                Rol: <strong>{accessContext?.role?.displayName ?? 'Sin rol'}</strong>
                {accessContext?.branch && (
                  <>
                    {' · '}Sucursal: <strong>{accessContext.branch.name}</strong>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="panel-actions-row">
            <button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>
              Actualizar acceso
            </button>
            <button type="button" className="submit-db-btn" onClick={handleSignOut} disabled={operationInProgress}>
              {operationInProgress ? 'Cerrando...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>

        {!hasAnyModule ? (
          /* Sesión válida sin módulos disponibles */
          <div className="login-card" style={{ margin: '3rem auto 0', maxWidth: '640px' }}>
            <p className="eyebrow" style={{ color: 'var(--primary-light)' }}>Sin operaciones asignadas</p>
            <h2 style={{ fontSize: '1.5rem', color: 'var(--primary-color)', margin: '0.5rem 0' }}>
              No tienes módulos disponibles
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Tu perfil está activo en el sistema, pero actualmente no dispones de las capacidades requeridas para operar Caja ni paneles administrativos.
            </p>
            <div className="auth-session-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>
                Actualizar acceso
              </button>
              <button type="button" className="submit-db-btn" onClick={handleSignOut} disabled={operationInProgress}>
                Cerrar sesión
              </button>
            </div>
          </div>
        ) : (
          /* Panel con módulos disponibles */
          <div className="panel-layout">
            <div className="panel-section-heading">
              <p className="eyebrow">Espacio de trabajo</p>
              <h2>Módulos disponibles</h2>
            </div>
            <div className="panel-grid">
              {showCatalog && (
                <article className="panel-card">
                  <div className="panel-card-header">
                    <div className="panel-card-title">
                      <PanelModuleIcon type="catalog" />
                      <div>
                        <span>Herramienta de trabajo</span>
                        <h3>Catálogo</h3>
                      </div>
                    </div>
                    <p>Consulta productos, precios efectivos y promociones vigentes certificadas por Supabase.</p>
                  </div>
                  <div className="panel-card-footer">
                    <button type="button" className="panel-card-link-btn" onClick={handleOpenCatalog}>Abrir Catálogo</button>
                  </div>
                </article>
              )}

              {/* Tarjeta Caja */}
              {(showCashier || cashierBlockedByBranch) && (
                <article className={`panel-card ${cashierBlockedByBranch ? 'disabled' : ''}`}>
                  <div className="panel-card-header">
                    <div className="panel-card-title">
                      <PanelModuleIcon type="cashier" />
                      <div>
                        <span>Operación comercial</span>
                        <h3>Caja Registradora</h3>
                      </div>
                    </div>
                    <p>Operación de terminal, cobro de ventas pendientes y conciliación de métodos de pago.</p>
                    {cashierBlockedByBranch && (
                      <div className="panel-card-lock-info" role="alert">
                        <span aria-hidden="true">!</span>
                        {branchState === 'none'
                          ? 'Necesitas una sucursal asignada para poder operar Caja.'
                          : 'Tu sucursal asignada se encuentra inactiva.'}
                      </div>
                    )}
                  </div>
                  <div className="panel-card-footer">
                    <button
                      type="button"
                      className="panel-card-link-btn"
                      onClick={handleOpenCashier}
                      disabled={cashierBlockedByBranch}
                      aria-disabled={cashierBlockedByBranch}
                    >
                      {cashierBlockedByBranch ? 'Caja Bloqueada' : 'Abrir Caja'}
                    </button>
                  </div>
                </article>
              )}

              {/* Tarjeta Administración */}
              {showAdmin && (
                <article className="panel-card">
                  <div className="panel-card-header">
                    <div className="panel-card-title">
                      <PanelModuleIcon type="admin" />
                      <div>
                        <span>Gestión central</span>
                        <h3>Administración</h3>
                      </div>
                    </div>
                    <p>Gestión de personal, sucursales asignadas, catálogos e inventario físico.</p>
                    {authorizedAdminModules.length > 0 && (
                      <ul className="panel-modules-list" aria-label="Módulos autorizados">
                        {authorizedAdminModules.map((modId) => {
                          const rule = ADMIN_MODULE_RULES.find((r) => r.id === modId)
                          return <li key={modId}><span aria-hidden="true">✓</span>{rule?.label ?? modId}</li>
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="panel-card-footer">
                    <button
                      type="button"
                      className="panel-card-link-btn"
                      onClick={handleOpenAdmin}
                    >
                      Abrir Administración
                    </button>
                  </div>
                </article>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
