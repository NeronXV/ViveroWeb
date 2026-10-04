import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
  return <main className="internal-page auth-page"><section className="login-card"><h1>{ready ? 'Establecer contraseña' : 'Recuperar acceso'}</h1>
    <form onSubmit={submit}><fieldset disabled={busy}>
      {ready ? <><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={15} required /></label>
        <label>Confirmar contraseña<input name="confirm" type="password" autoComplete="new-password" minLength={15} required /></label></> :
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>}
      <button className="catalog-action">{ready ? 'Guardar contraseña' : 'Enviar enlace'}</button>
    </fieldset></form>
    {token && <button type="button" disabled={busy} onClick={() => { setToken(null); setError(''); setNotice('') }}>Solicitar otro enlace</button>}
    <p role="status">{notice}</p>{error && <p role="alert">{error}</p>}<Link to="/login">Volver al acceso</Link>
  </section></main>
}
