import type { BackendSessionState } from './backend-session'

// Read-only bridge to the sole AuthProvider-owned controller; stores no token itself.
let read: (() => BackendSessionState) | null = null
export function bindBackendSession(reader: () => BackendSessionState): () => void {
  read = reader
  return () => { if (read === reader) read = null }
}
export function requireBackendAccess() {
  const state = read?.()
  if (!state?.session || state.session.expiresAt <= Date.now() || state.accessStatus !== 'ready' ||
    !state.context || state.context.user.id !== state.session.userId) throw new Error('La sesión no está disponible. Inicia sesión o consulta tus permisos.')
  return { token: state.session.accessToken, context: state.context }
}
// An API session with unavailable permissions must never fall back to Supabase.
export function hasBackendIdentity(): boolean { return Boolean(read?.().session) }
export function backendId(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 4294967295) throw new Error('Identificador incompatible con la API.')
  return Number(value)
}
export async function backendKey(value: string, scope: string): Promise<string> {
  if (/^[a-f0-9]{64}$/.test(value)) return value
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('Clave de intento no válida.')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope + ':' + value))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
