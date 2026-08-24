import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'

interface AccessDeniedProps {
  reason: string
  onRetry?: () => void
}

export function AccessDenied({ reason, onRetry }: AccessDeniedProps) {
  const navigate = useNavigate()
  const { status, operationInProgress, signOut } = useAuth()
  const authenticated = status === 'authenticated'

  const logout = async () => {
    if (await signOut()) navigate('/login', { replace: true })
  }

  return <main className="internal-page access-boundary-page"><section className="login-card access-denied-card" aria-labelledby="access-denied-title"><p className="eyebrow">Acceso interno</p><h1 id="access-denied-title">Acceso no disponible</h1><p>{reason}</p><div className="access-boundary-actions">{onRetry && <button type="button" className="secondary-auth-btn" onClick={onRetry}>Reintentar contexto</button>}{authenticated && <button type="button" className="submit-db-btn" onClick={logout} disabled={operationInProgress}>{operationInProgress ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>}{!authenticated && <Link className="secondary-auth-link" to="/login">Ir al inicio de sesión</Link>}<Link className="back-link" to="/">Volver al sitio público</Link></div></section></main>
}
