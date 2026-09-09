import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getSupabaseClient } from '../../lib/supabase/client'
export function NewsletterConfirmation() {
  const [params] = useSearchParams()
  const unsubscribe = params.has('unsubscribe'), token = params.get(unsubscribe ? 'unsubscribe' : 'confirm') ?? ''
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [done, setDone] = useState(false)
  const confirm = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      const { error } = await getSupabaseClient().rpc(unsubscribe ? 'unsubscribe_newsletter' : 'confirm_newsletter_subscription', { p_token: token })
      if (error) throw error
      setDone(true); setMessage(unsubscribe ? 'Tu baja quedó registrada.' : 'Tu suscripción quedó confirmada.')
    } catch { setMessage('El enlace no es válido, ya se utilizó o el servicio no está disponible.') }
    finally { setBusy(false) }
  }
  return <main className="internal-page"><section className="login-card"><h1>{unsubscribe ? 'Cancelar suscripción' : 'Confirmar suscripción'}</h1>
    {!valid && <p role="alert">El enlace no es válido.</p>}<p role="status">{message}</p>
    {!done && <button className="catalog-action" disabled={!valid || busy} onClick={confirm}>Confirmar</button>}
    <Link to="/">Volver al vivero</Link>
  </section></main>
}
