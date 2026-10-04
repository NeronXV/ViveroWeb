import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
  return <main className="internal-page"><section className="login-card"><h1>{unsubscribe ? 'Cancelar suscripción' : 'Confirmar suscripción'}</h1>
    {!valid && <p role="alert">El enlace no es válido.</p>}<p role="status">{message}</p>
    {!done && <button className="catalog-action" disabled={!valid || busy} onClick={confirm}>Confirmar</button>}
    <Link to="/">Volver al vivero</Link>
  </section></main>
}
