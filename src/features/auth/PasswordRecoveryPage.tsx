import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { accountRecovery, recoveryToken } from './account-links-service'
import { useAuth } from './useAuth'

export function PasswordRecoveryPage() {
  const { signOut, status } = useAuth()
  const [token, setToken] = useState(() => recoveryToken(window.location.hash))
  const ready = Boolean(token)
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
    return () => { pending.current?.abort() }
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form), controller = new AbortController()
    pending.current = controller
    setError(''); setNotice(''); setBusy(true)
    try {
      if (token) {
        const password = String(values.get('password'))
        if ([...password].length < 15 || [...password].length > 128 || password !== values.get('confirm')) throw new Error('Las contraseñas deben coincidir y tener de 15 a 128 caracteres.')
        await accountRecovery('password', { token, password }, controller.signal)
        if (controller.signal.aborted) return
        if (status === 'authenticated') await signOut()
        if (controller.signal.aborted) return
        setToken(null)
        setNotice('Contraseña guardada. Inicia sesión nuevamente.'); form.reset()
      } else {
        await accountRecovery('recovery', { email: String(values.get('email')).trim() }, controller.signal)
        if (controller.signal.aborted) return
        setNotice('Si la cuenta está habilitada, recibirás un enlace. Si no llega, solicita otro más tarde.')
      }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se completó la solicitud.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <main className="internal-page auth-page"><section className="login-card" aria-labelledby="recovery-title">
    <Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link>
    <p className="eyebrow">Acceso interno</p>
    <h1 id="recovery-title">{ready ? 'Establecer contraseña' : 'Recuperar acceso'}</h1>
    <p>{ready ? 'Ingresa tu nueva contraseña para acceder al sistema.' : 'Introduce tu correo para recibir un enlace de recuperación seguro.'}</p>
    <form className="auth-form" onSubmit={submit}><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '1.25rem' }}>
      {ready ? <>
        <div className="form-group">
          <label htmlFor="recovery-password">Nueva contraseña</label>
          <input id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={15} required />
        </div>
        <div className="form-group">
          <label htmlFor="recovery-confirm">Confirmar contraseña</label>
          <input id="recovery-confirm" name="confirm" type="password" autoComplete="new-password" minLength={15} required />
        </div>
      </> : (
        <div className="form-group">
          <label htmlFor="recovery-email">Correo electrónico</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" required />
        </div>
      )}
      {error && <p className="auth-error" role="alert" aria-live="assertive">{error}</p>}
      {notice && <p className="form-notice" role="status" aria-live="polite">{notice}</p>}
      <button type="submit" className="submit-db-btn" disabled={busy}>{busy ? 'Enviando…' : ready ? 'Guardar contraseña' : 'Enviar enlace'}</button>
    </fieldset></form>
    {token && <button type="button" className="secondary-auth-btn" style={{ marginTop: '0.75rem', width: '100%' }} disabled={busy} onClick={() => { setToken(null); setError(''); setNotice('') }}>Solicitar otro enlace</button>}
    <Link className="back-link" to="/login">← Volver al inicio de sesión</Link>
  </section></main>
}
