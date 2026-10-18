import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { newsletterLink, publicNewsletter } from './newsletter-service'

export function NewsletterConfirmation() {
  const [link] = useState(() => newsletterLink(window.location.hash))
  const unsubscribe = link?.action === 'unsubscribe', valid = Boolean(link)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname); return () => { pending.current?.abort() } }, [])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [done, setDone] = useState(false)
  const confirm = async () => {
    if (!link || busy || done) return
    const controller = new AbortController(); pending.current = controller
    setBusy(true)
    try {
      await publicNewsletter(link.action, { token: link.token }, controller.signal)
      if (controller.signal.aborted) return
      setDone(true); setMessage(unsubscribe ? 'Tu baja quedó registrada.' : 'Tu suscripción quedó confirmada.')
    } catch { if (!controller.signal.aborted) setMessage('El enlace no es válido, ya se utilizó o el servicio no está disponible.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <main className="internal-page auth-page"><section className="login-card" aria-labelledby="newsletter-confirm-title">
    <Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link>
    <p className="eyebrow">Boletín Informativo</p>
    <h1 id="newsletter-confirm-title">{unsubscribe ? 'Cancelar suscripción' : 'Confirmar suscripción'}</h1>
    {!valid && <p className="auth-error" role="alert">El enlace no es válido o ha expirado.</p>}
    {message && <p className="form-notice" role="status">{message}</p>}
    {!done && valid && <button type="button" className="submit-db-btn" style={{ marginTop: '1rem' }} disabled={busy} onClick={confirm}>
      {busy ? 'Confirmando…' : 'Confirmar'}
    </button>}
    <Link className="back-link" to="/">← Volver al sitio público</Link>
  </section></main>
}
