import { useEffect, useRef, useState, type FormEvent } from 'react'
import { campaigns, createCampaign, sendCampaign, campaignContent, type Campaign } from './newsletter-service'
import { requireBackendAccess } from '../auth/backend-runtime'
import { prepareCampaignAttempt, readCampaignAttempt, clearCampaignAttempt } from './campaign-attempt'

export function AdminNewsletter() {
  const [rows, setRows] = useState<Campaign[]>([]), [revision, setRevision] = useState(0)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const pending = useRef<AbortController | null>(null)
  const [subject, setSubject] = useState(''), [body, setBody] = useState(''), [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const attempt = readCampaignAttempt(localStorage, requireBackendAccess().context.user.id)
      if (attempt) { setSubject(attempt.subject); setBody(attempt.body); setRestored(true); setNotice('Hay una campaña pendiente. Reintenta con su texto original para recuperar el resultado.') }
    } catch { setError('No se pudo leer el intento guardado. No crees otra campaña hasta revisar el almacenamiento.'); setRestored(true) }
    return () => { pending.current?.abort() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    campaigns(controller.signal).then(value => { if (!controller.signal.aborted) setRows(value) }).catch(() => {
      if (!controller.signal.aborted) setError('No se pudo consultar el boletín. Comprueba que el servicio esté habilitado.')
    })
    return () => controller.abort()
  }, [revision])
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, data = new FormData(form), subject = String(data.get('subject')).trim(), body = String(data.get('body')).trim()
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError('')
    try {
      const execute = async () => {
        campaignContent(subject, body)
        const actor = requireBackendAccess().context.user.id
        const attempt = prepareCampaignAttempt(localStorage, actor, subject, body)
        setRestored(true)
        await createCampaign(subject, body, attempt.key, controller.signal)
        if (controller.signal.aborted) return
        if (requireBackendAccess().context.user.id !== actor) throw new Error('La cuenta cambió.')
        clearCampaignAttempt(localStorage, attempt)
      }
      if (!navigator.locks) throw new Error('El navegador no permite proteger la campaña entre pestañas.')
      await navigator.locks.request('vivero-newsletter-create', { signal: controller.signal }, execute)
      if (controller.signal.aborted) return
      setRestored(false); setSubject(''); setBody(''); form.reset(); setNotice('Campaña preparada. Revisa el número de destinatarios antes de enviar.'); setRevision((value) => value + 1)
    } catch { if (!controller.signal.aborted) setError('No se confirmó la campaña. Actualiza la lista y reintenta con el mismo texto.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  const send = async (campaign: Campaign) => {
    if (busy) return
    const controller = new AbortController(); pending.current = controller
    setBusy(true); setError('')
    try {
      const sent = await sendCampaign(campaign.id, controller.signal)
      if (controller.signal.aborted) return
      setNotice(String(sent) + ' correos aceptados por el servicio en este lote.'); setRevision((value) => value + 1)
    } catch { if (!controller.signal.aborted) setError('No se confirmó el lote. Revisa Resend y actualiza la lista antes de reintentar.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <section className="db-tab-content active"><h3>Boletín Verde</h3>
    <p>Solo se envía a suscriptores que confirmaron su correo. Cada envío incluye un enlace de baja.</p>
    {error && <p role="alert">{error}</p>}{notice && <p className="form-notice" role="status">{notice}</p>}
    <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => { setError(''); setRevision((value) => value + 1) }}>Actualizar</button>
    <form className="dashboard-form dashboard-operation-form" onSubmit={create}><fieldset disabled={busy}><legend>Preparar campaña</legend>
      <label>Asunto<input name="subject" value={subject} readOnly={restored} onChange={event => setSubject(event.target.value)} required minLength={3} maxLength={150} /></label>
      <label>Mensaje<textarea name="body" value={body} readOnly={restored} onChange={event => setBody(event.target.value)} required minLength={10} maxLength={10000} rows={6} /></label>
      <button className="catalog-action">{restored ? 'Recuperar campaña pendiente' : 'Guardar campaña'}</button>
    </fieldset></form>
    {rows.map((row) => <article className="botanical-section-card dashboard-campaign-card" key={row.id}><h4>{row.subject}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{row.body}</p>
      <p>{row.recipients} destinatarios · {row.sent} enviados · {row.skipped} bajas omitidas</p>
      {row.review > 0 && <p role="alert">Hay envíos antiguos sin confirmar. Revisa su estado en el proveedor antes de continuar.</p>}
      <button className="catalog-action" disabled={busy || row.review > 0 || row.sent + row.skipped >= row.recipients} onClick={() => send(row)}>Enviar siguiente lote (hasta 20 correos)</button>
    </article>)}
  </section>
}
