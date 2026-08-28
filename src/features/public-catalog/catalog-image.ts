import { getSupabaseClient } from '../../lib/supabase/client'
import { getSupabaseEnv } from '../../lib/supabase/env'
import { isValidCatalogStoragePath, PUBLIC_CATALOG_IMAGE_BUCKET } from './catalog-parser'
import type { PublicCatalogImage } from './catalog-types'

interface PublicUrlResult {
  data?: {
    publicUrl?: unknown
  }
}

export interface CatalogStorageClient {
  from: (bucketName: string) => {
    getPublicUrl: (storagePath: string) => PublicUrlResult
  }
}

const SUPABASE_HOST_PATTERN = /^[a-z0-9][a-z0-9-]*\.supabase\.co$/
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isSafePublicUrl(value: unknown, expectedOrigin: string): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const origin = new URL(expectedOrigin)
    const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname
    const isAllowedLocal = LOOPBACK_HOSTS.has(hostname) && (url.protocol === 'http:' || url.protocol === 'https:')
    const isAllowedRemote = url.protocol === 'https:' && SUPABASE_HOST_PATTERN.test(hostname) && url.port === ''
    return url.username === '' && url.password === '' && url.origin === origin.origin && (isAllowedLocal || isAllowedRemote)
  } catch {
    return false
  }
}

export function resolvePublicCatalogImageUrl(
  image: PublicCatalogImage | null,
  storage: CatalogStorageClient = getSupabaseClient().storage,
  expectedOrigin: string = getSupabaseEnv().url,
): string | null {
  if (
    image === null ||
    image.bucketName !== PUBLIC_CATALOG_IMAGE_BUCKET ||
    !isValidCatalogStoragePath(image.storagePath)
  ) return null

  try {
    const result = storage.from(image.bucketName).getPublicUrl(image.storagePath)
    const publicUrl = result.data?.publicUrl
    return isSafePublicUrl(publicUrl, expectedOrigin) ? publicUrl : null
  } catch {
    return null
  }
}
