import { getSupabaseClient } from '../../lib/supabase/client'
import { parseUserAccessContext } from './access-parser'
import type { UserAccessContext } from './access-types'

const ACCESS_CONTEXT_TIMEOUT_MS = 6_000

export class AccessContextLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessContextLoadError'
  }
}

export async function loadMyAccessContext(): Promise<UserAccessContext> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), ACCESS_CONTEXT_TIMEOUT_MS)

  try {
    const { data, error } = await getSupabaseClient()
      .rpc('get_my_access_context')
      .abortSignal(timeoutController.signal)

    if (error) throw new AccessContextLoadError('No fue posible cargar tu contexto de acceso.')

    try {
      return parseUserAccessContext(data)
    } catch {
      throw new AccessContextLoadError('El servicio devolvió un contexto de acceso no válido.')
    }
  } finally {
    window.clearTimeout(timeoutId)
  }
}
