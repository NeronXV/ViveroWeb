import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { getBranchState, isCashierEligible } from '../access/access-helpers'
import type { UserAccessContext } from '../access/access-types'
import { useAuth } from './useAuth'

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ACCESS_MESSAGES = {
  ACTIVE: 'Tu perfil y rol están activos. Las capacidades mostradas son informativas y todavía no protegen rutas.',
  PROFILE_MISSING: 'Tu cuenta no tiene un perfil configurado. No se habilita ninguna capacidad.',
  PROFILE_INACTIVE: 'Tu cuenta está desactivada. No se habilita ninguna capacidad.',
  NO_ROLE: 'Tu cuenta todavía no tiene un rol asignado. No se habilita ninguna capacidad.',
} as const

function AccessDetails({ context }: { context: UserAccessContext }) {
  const branchState = getBranchState(context)
  const branchLabel = branchState === 'active' ? 'Asignada activa' : branchState === 'inactive' ? 'Asignada inactiva' : 'No asignada'

  return <div className="access-context" aria-label="Contexto de acceso"><p className={`access-state access-state-${context.accessState.toLowerCase()}`}>{context.accessState}</p><p>{ACCESS_MESSAGES[context.accessState]}</p><dl className="access-summary"><div><dt>Perfil</dt><dd>{context.profile?.fullName ?? 'No disponible'}</dd></div><div><dt>Rol</dt><dd>{context.role ? `${context.role.displayName} (${context.role.name})` : 'Sin rol'}</dd></div><div><dt>Sucursal</dt><dd>{context.branch?.name ?? 'Sin sucursal asignada'}</dd></div><div><dt>Estado de sucursal</dt><dd>{branchLabel}</dd></div><div><dt>Disponibilidad futura de Caja</dt><dd>{isCashierEligible(context) ? 'Elegible' : 'No elegible'}</dd></div></dl><div className="capability-list"><h2>Capacidades efectivas</h2>{context.capabilities.length > 0 ? <ul>{context.capabilities.map((capability) => <li key={capability}><code>{capability}</code></li>)}</ul> : <p>Sin capacidades efectivas.</p>}</div></div>
}

export function LoginPage() {
  const navigate = useNavigate()
  const { status, error, accessStatus, accessContext, accessError, operationInProgress, signInWithPassword, signOut, clearError, refreshAccessContext } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operationInProgress) return

    const normalizedEmail = email.trim()
    if (!BASIC_EMAIL_PATTERN.test(normalizedEmail)) {
      setValidationError('Introduce un correo electrónico válido.')
      return
    }

    if (!password) {
      setValidationError('Introduce tu contraseña.')
      return
    }

    setValidationError(null)
    const authenticated = await signInWithPassword(normalizedEmail, password)
    if (authenticated) setPassword('')
  }

  const logout = async () => {
    if (await signOut()) navigate('/login', { replace: true })
  }

  const updateEmail = (value: string) => {
    setEmail(value)
    setValidationError(null)
    if (error) clearError()
  }

  const updatePassword = (value: string) => {
    setPassword(value)
    setValidationError(null)
    if (error) clearError()
  }

  return <main className="internal-page auth-page"><section className="login-card" aria-labelledby="login-title"><Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link>{status === 'initializing' ? <div className="auth-status" role="status"><h1 id="login-title">Restaurando sesión</h1><p>Espera un momento mientras verificamos la sesión local.</p></div> : status === 'authenticated' ? <div className="auth-session"><p className="eyebrow">Sesión local activa</p><h1 id="login-title">Contexto de acceso</h1>{accessStatus === 'loading' && <div className="access-loading" role="status"><p>Cargando perfil, rol, sucursal y capacidades…</p></div>}{accessStatus === 'error' && <div className="access-error" role="alert"><p>{accessError}</p><button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>Reintentar contexto</button></div>}{accessStatus === 'ready' && accessContext && <AccessDetails context={accessContext} />}{accessStatus === 'idle' && <p role="status">Esperando el contexto de acceso.</p>}<div className="auth-session-actions">{accessStatus === 'ready' && <button type="button" className="secondary-auth-btn" onClick={refreshAccessContext}>Actualizar contexto</button>}<button type="button" className="submit-db-btn" onClick={logout} disabled={operationInProgress}>{operationInProgress ? 'Cerrando sesión…' : 'Cerrar sesión'}</button></div></div> : <><p className="eyebrow">Acceso interno</p><h1 id="login-title">Iniciar sesión</h1><p>Usa tu cuenta autorizada. Caja y Administración continúan como rutas demostrativas sin protección hasta las siguientes fases.</p><form className="auth-form" onSubmit={submit} noValidate><div className="form-group"><label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => updateEmail(event.target.value)} disabled={operationInProgress} required /></div><div className="form-group"><label htmlFor="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => updatePassword(event.target.value)} disabled={operationInProgress} required /></div><p className="auth-error" role="alert">{validationError ?? error}</p><button type="submit" className="submit-db-btn" disabled={operationInProgress}>{operationInProgress ? 'Iniciando sesión…' : 'Iniciar sesión'}</button></form></>}<Link className="back-link" to="/">← Volver al sitio público</Link></section></main>
}
