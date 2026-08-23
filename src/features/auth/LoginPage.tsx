import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { useAuth } from './useAuth'

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const navigate = useNavigate()
  const { status, user, error, operationInProgress, signInWithPassword, signOut, clearError } = useAuth()
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

  return <main className="internal-page auth-page"><section className="login-card" aria-labelledby="login-title"><Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link>{status === 'initializing' ? <div className="auth-status" role="status"><h1 id="login-title">Restaurando sesión</h1><p>Espera un momento mientras verificamos la sesión local.</p></div> : status === 'authenticated' ? <div className="auth-session"><p className="eyebrow">Sesión local activa</p><h1 id="login-title">Sesión iniciada</h1><p>Permisos pendientes de cargar. Esta sesión todavía no autoriza el acceso a Caja o Administración.</p><p className="auth-user">Usuario: <strong>{user?.email ?? 'Correo no disponible'}</strong></p><button type="button" className="submit-db-btn" onClick={logout} disabled={operationInProgress}>{operationInProgress ? 'Cerrando sesión…' : 'Cerrar sesión'}</button></div> : <><p className="eyebrow">Acceso interno</p><h1 id="login-title">Iniciar sesión</h1><p>Usa tu cuenta autorizada. Caja y Administración continúan como rutas demostrativas sin protección hasta las siguientes fases.</p><form className="auth-form" onSubmit={submit} noValidate><div className="form-group"><label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => updateEmail(event.target.value)} disabled={operationInProgress} required /></div><div className="form-group"><label htmlFor="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => updatePassword(event.target.value)} disabled={operationInProgress} required /></div><p className="auth-error" role="alert">{validationError ?? error}</p><button type="submit" className="submit-db-btn" disabled={operationInProgress}>{operationInProgress ? 'Iniciando sesión…' : 'Iniciar sesión'}</button></form></>}<Link className="back-link" to="/">← Volver al sitio público</Link></section></main>
}
