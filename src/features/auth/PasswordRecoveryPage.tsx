import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getSupabaseClient } from '../../lib/supabase/client'
export function PasswordRecoveryPage() {
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const client = getSupabaseClient()
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { if (active) setReady(Boolean(session)) })
    client.auth.getSession().then(({ data }) => { if (active) { setReady(Boolean(data.session)); setLoading(false) } })
      .catch(() => { if (active) { setError('No se pudo revisar el enlace.'); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form), client = getSupabaseClient()
    setError(''); setNotice(''); setBusy(true)
    try {
      if (ready) {
        const password = String(values.get('password'))
        if (password.length < 8 || password !== values.get('confirm')) throw new Error('Las contraseñas deben coincidir y tener al menos 8 caracteres.')
        const { error: failure } = await client.auth.updateUser({ password })
        if (failure) throw new Error('No se pudo guardar la contraseña. Solicita otro enlace si venció.')
        setNotice('Contraseña guardada. Ya puedes iniciar sesión en Web o Android.'); form.reset()
      } else {
        const { error: failure } = await client.auth.resetPasswordForEmail(String(values.get('email')).trim(), { redirectTo: window.location.origin + '/recuperar' })
        if (failure) throw new Error('No se pudo solicitar el enlace. Intenta más tarde.')
        setNotice('Si la cuenta existe, recibirás un enlace para recuperar el acceso.')
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se completó la solicitud.') }
    finally { setBusy(false) }
  }
  return <main className="internal-page auth-page"><section className="login-card"><h1>{ready ? 'Establecer contraseña' : 'Recuperar acceso'}</h1>
    {loading ? <p role="status">Revisando enlace…</p> : <form onSubmit={submit}><fieldset disabled={busy}>
      {ready ? <><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Confirmar contraseña<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label></> :
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>}
      <button className="catalog-action">{ready ? 'Guardar contraseña' : 'Enviar enlace'}</button>
    </fieldset></form>}
    <p role="status">{notice}</p>{error && <p role="alert">{error}</p>}<Link to="/login">Volver al acceso</Link>
  </section></main>
}
