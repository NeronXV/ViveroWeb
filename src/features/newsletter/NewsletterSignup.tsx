import { useEffect, useRef, useState, type FormEvent } from 'react'
import { publicNewsletter } from './newsletter-service'
export function NewsletterSignup() {
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => { pending.current?.abort() }, [])
  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form)
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setNotice(''); setError('')
    try {
      await publicNewsletter('subscribe', { email: String(values.get('email')).trim(), consent: values.has('consent') }, controller.signal)
      if (controller.signal.aborted) return
      setNotice('Si el correo necesita confirmación, recibirás un enlace. Revisa tu bandeja y spam; no estás suscrito hasta confirmar.'); form.reset()
    } catch { if (!controller.signal.aborted) setError('No pudimos confirmar la solicitud. El servicio de correo puede no estar habilitado; intenta más tarde.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="footer-newsletter"><h5>Boletín Verde</h5><p>Recibe novedades y consejos del vivero.</p>
    <form onSubmit={subscribe}>
      <div className="newsletter-form">
        <label className="sr-only" htmlFor="newsletter-email">Correo electrónico</label>
        <input id="newsletter-email" name="email" type="email" placeholder="Tu correo electrónico" maxLength={254} disabled={busy} required />
        <button disabled={busy}>{busy ? 'Enviando…' : 'Suscribirme'}</button>
      </div>
      <label className="newsletter-consent"><input name="consent" type="checkbox" disabled={busy} required /> Acepto recibir el boletín; puedo darme de baja en cada correo.</label>
    </form>
    {notice && <p className="newsletter-feedback notice" role="status">{notice}</p>}
    {error && <p className="newsletter-feedback error" role="alert">{error}</p>}
  </div>
}
