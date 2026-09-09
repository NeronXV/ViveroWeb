import { useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase/client'
export function StaffInvitation() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget, values = new FormData(form)
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: failure } = await getSupabaseClient().functions.invoke('invite-staff', { body: { name: values.get('name'), email: values.get('email') } })
      if (failure || data?.invited !== true) throw new Error()
      setNotice('Invitación enviada. Actualiza el directorio y asigna rol y sucursal con los controles de Personal.'); form.reset()
    } catch { setError('No se confirmó la invitación. Revisa si la cuenta ya existe y si el correo está configurado.') }
    finally { setBusy(false) }
  }
  return <details className="botanical-section-card dashboard-operation-card"><summary>Invitar nuevo trabajador</summary>
    <p>Recibirá un enlace para crear su contraseña. La invitación no concede permisos ni sucursal.</p>
    <form className="dashboard-form dashboard-operation-form" onSubmit={submit}><fieldset disabled={busy}><label>Nombre<input name="name" minLength={2} maxLength={160} required /></label>
      <label>Correo<input name="email" type="email" maxLength={254} required /></label><button className="catalog-action">Enviar invitación</button>
    </fieldset></form>{notice && <p className="form-notice" role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </details>
}
