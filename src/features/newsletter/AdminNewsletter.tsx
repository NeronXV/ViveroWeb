import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'
import { operation, object, text, cents } from '../cashier/cashier-operations-service'
type Campaign = { id: string; subject: string; body: string; recipients: number; sent: number; skipped: number }
function parseCampaigns(value: unknown): Campaign[] {
  if (!Array.isArray(value)) throw new Error('Respuesta incompatible.')
  return value.map((entry) => { const row = object(entry); return { id: text(row.id), subject: text(row.subject), body: text(row.body), recipients: cents(row.recipients), sent: cents(row.sent), skipped: cents(row.skipped) } })
}
export function AdminNewsletter() {
  const [rows, setRows] = useState<Campaign[]>([]), [revision, setRevision] = useState(0)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    operation('get_newsletter_campaigns', {}, parseCampaigns, controller.signal).then(setRows).catch(() => {
      if (!controller.signal.aborted) setError('No se pudo consultar el boletín. Comprueba que el servicio esté habilitado.')
    })
    return () => controller.abort()
  }, [revision])
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, data = new FormData(form), subject = String(data.get('subject')).trim(), body = String(data.get('body')).trim()
    const fingerprint = JSON.stringify([subject, body])
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      await operation('create_newsletter_campaign', { p_id: attempt.current.key, p_subject: subject, p_body: body }, object)
      attempt.current = null; form.reset(); setNotice('Campaña preparada. Revisa el número de destinatarios antes de enviar.'); setRevision((value) => value + 1)
    } catch { setError('No se confirmó la campaña. Reintenta con el mismo texto.') }
    finally { setBusy(false) }
  }
  const send = async (campaign: Campaign) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data, error: failure } = await getSupabaseClient().functions.invoke('newsletter', { body: { action: 'send', campaignId: campaign.id } })
      if (failure || !Number.isInteger(data?.sent)) throw new Error()
      setNotice(String(data.sent) + ' correos aceptados por el servicio en este lote.'); setRevision((value) => value + 1)
    } catch { setError('No se confirmó el lote. Revisa Resend y actualiza la lista antes de reintentar.') }
    finally { setBusy(false) }
  }
  return <section className="db-tab-content active"><h3>Boletín Verde</h3>
    <p>Solo se envía a suscriptores que confirmaron su correo. Cada envío incluye un enlace de baja.</p>
    {error && <p role="alert">{error}</p>}<p role="status">{notice}</p>
    <button onClick={() => { setError(''); setRevision((value) => value + 1) }}>Actualizar</button>
    <form onSubmit={create}><fieldset disabled={busy}><legend>Preparar campaña</legend>
      <label>Asunto<input name="subject" required minLength={3} maxLength={150} /></label>
      <label>Mensaje<textarea name="body" required minLength={10} maxLength={10000} rows={6} /></label>
      <button className="catalog-action">Guardar campaña</button>
    </fieldset></form>
    {rows.map((row) => <article className="botanical-section-card" key={row.id}><h4>{row.subject}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{row.body}</p>
      <p>{row.recipients} destinatarios · {row.sent} enviados · {row.skipped} bajas omitidas</p>
      <button className="catalog-action" disabled={busy || row.sent + row.skipped >= row.recipients} onClick={() => send(row)}>Enviar siguiente lote (hasta 20 correos)</button>
    </article>)}
  </section>
}
