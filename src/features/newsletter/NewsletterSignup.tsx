import { useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'
export function NewsletterSignup() {
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form)
    setBusy(true); setNotice(''); setError('')
    try {
      const { data, error: failure } = await getSupabaseClient().functions.invoke('newsletter', {
        body: { action: 'subscribe', email: String(values.get('email')), consent: values.has('consent') },
      })
      if (failure || data?.accepted !== true) throw new Error()
      setNotice('Si el correo necesita confirmación, recibirás un enlace. Revisa tu bandeja y spam; no estás suscrito hasta confirmar.'); form.reset()
    } catch { setError('No pudimos confirmar la solicitud. El servicio de correo puede no estar habilitado; intenta más tarde.') }
    finally { setBusy(false) }
  }
  return <div className="footer-newsletter"><h5>Boletín Verde</h5><p>Recibe novedades y consejos del vivero.</p>
    <form onSubmit={subscribe}><label>Correo electrónico<input name="email" type="email" maxLength={254} required /></label>
      <label><input name="consent" type="checkbox" required /> Acepto recibir el boletín; puedo darme de baja en cada correo.</label>
      <button disabled={busy}>{busy ? 'Enviando…' : 'Solicitar suscripción'}</button>
    </form><p role="status">{notice}</p>{error && <p role="alert">{error}</p>}
  </div>
}
