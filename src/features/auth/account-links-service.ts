import { backendHttp, object } from '../../lib/backend-http'

export function recoveryToken(fragment: string): string | null {
  return /^#token=([A-Za-z0-9_-]{43})$/.exec(fragment)?.[1] ?? null
}
export async function accountRecovery(path: 'recovery' | 'password', body: { email: string } | { token: string; password: string }, signal?: AbortSignal): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/v1/auth/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    })
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error('No se pudo conectar. Intenta nuevamente.')
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'Demasiados intentos. Espera antes de volver a intentar.'
    : response.status === 503 ? 'El correo o el servicio no está disponible. Intenta más tarde.'
      : 'El enlace no es válido o venció. Solicita uno nuevo; usa una contraseña de 15 a 128 caracteres.')
  const result = object(await response.json())
  if (result[path === 'recovery' ? 'accepted' : 'password_changed'] !== true) throw new Error('No se confirmó la operación.')
}
export async function inviteStaff(name: string, email: string, signal?: AbortSignal): Promise<void> {
  const result = object(await backendHttp('admin/staff/invitations', 'POST', { name, email }, signal))
  if (result.invited !== true) throw new Error('No se confirmó la invitación.')
}
