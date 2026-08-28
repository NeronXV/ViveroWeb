import { getSupabaseClient } from '../../lib/supabase/client'
import { parsePublicCatalogResponse } from './catalog-parser'
import { buildPublicCatalogRpcParams, type PublicCatalogQuery } from './catalog-query'
import type { PublicCatalogResponse } from './catalog-types'

const PUBLIC_CATALOG_TIMEOUT_MS = 8_000

export class PublicCatalogLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicCatalogLoadError'
  }
}

export async function loadPublicCatalog(
  query: PublicCatalogQuery,
  callerSignal?: AbortSignal,
): Promise<PublicCatalogResponse> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), PUBLIC_CATALOG_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    const { data, error } = await getSupabaseClient()
      .rpc('get_public_catalog', buildPublicCatalogRpcParams(query))
      .abortSignal(signal)
    if (error) throw new PublicCatalogLoadError('No fue posible cargar el catálogo.')
    try {
      return parsePublicCatalogResponse(data)
    } catch {
      throw new PublicCatalogLoadError('El servicio devolvió un catálogo no válido.')
    }
  } catch (error) {
    if (error instanceof PublicCatalogLoadError) throw error
    throw new PublicCatalogLoadError('No fue posible cargar el catálogo.')
  } finally {
    window.clearTimeout(timeoutId)
  }
}
