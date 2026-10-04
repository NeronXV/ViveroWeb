import { useEffect, useRef, useState, type FormEvent } from 'react'
import { inviteStaff } from '../auth/account-links-service'
export function StaffInvitation() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => { pending.current?.abort() }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form)
    const controller = new AbortController()
    pending.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      await inviteStaff(String(values.get('name')).trim(), String(values.get('email')).trim(), controller.signal)
      if (controller.signal.aborted) return
      setNotice('Correo aceptado para envío. Cuando el trabajador establezca su contraseña, actualiza el directorio y asigna rol y sucursal en Personal.'); form.reset()
    } catch { if (!controller.signal.aborted) setError('No se confirmó la invitación. Revisa si la cuenta ya existe y si el correo está configurado.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <details className="botanical-section-card dashboard-operation-card"><summary>Invitar nuevo trabajador</summary>
    <p>Recibirá un enlace para crear su contraseña. La invitación no concede permisos ni sucursal.</p>
    <form className="dashboard-form dashboard-operation-form" onSubmit={submit}><fieldset disabled={busy}><label>Nombre<input name="name" minLength={2} maxLength={160} required /></label>
      <label>Correo<input name="email" type="email" maxLength={254} required /></label><button className="catalog-action">Enviar invitación</button>
    </fieldset></form>{notice && <p className="form-notice" role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </details>
}
