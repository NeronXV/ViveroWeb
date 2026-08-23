export interface SupabaseEnv {
  url: string
  publishableKey: string
}

export interface SupabaseEnvSource {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

const EXAMPLE_URL_MARKER = 'your-project-ref'
const EXAMPLE_KEY_MARKER = 'your-public-publishable-key'
const SUPABASE_HOST_PATTERN = /^[a-z0-9][a-z0-9-]*\.supabase\.co$/
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

export function validateSupabaseEnv(
  source: SupabaseEnvSource,
  isDevelopment: boolean,
): SupabaseEnv {
  const urlValue = source.VITE_SUPABASE_URL?.trim() ?? ''
  const publishableKey = source.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

  if (!urlValue) {
    throw new Error('Falta configurar VITE_SUPABASE_URL.')
  }

  if (!publishableKey) {
    throw new Error('Falta configurar VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  if (urlValue.includes(EXAMPLE_URL_MARKER) || publishableKey.includes(EXAMPLE_KEY_MARKER)) {
    throw new Error('La configuración de Supabase todavía contiene marcadores de ejemplo.')
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(urlValue)
  } catch {
    throw new Error('VITE_SUPABASE_URL debe ser una URL válida de Supabase.')
  }

  const hasSafeUrlShape =
    parsedUrl.username === '' &&
    parsedUrl.password === '' &&
    (parsedUrl.pathname === '' || parsedUrl.pathname === '/') &&
    parsedUrl.search === '' &&
    parsedUrl.hash === ''

  if (!hasSafeUrlShape) {
    throw new Error(
      'VITE_SUPABASE_URL no debe incluir credenciales, consultas, fragmentos ni rutas adicionales.',
    )
  }

  const hostname = normalizeHostname(parsedUrl.hostname)
  const isLoopback = LOOPBACK_HOSTS.has(hostname)
  const isAllowedRemote =
    parsedUrl.protocol === 'https:' &&
    SUPABASE_HOST_PATTERN.test(hostname) &&
    parsedUrl.port === ''
  const isAllowedLocal =
    isDevelopment &&
    isLoopback &&
    (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')

  if (isLoopback && !isDevelopment) {
    throw new Error('Las URL locales de Supabase solo están permitidas durante el desarrollo.')
  }

  if (!isAllowedRemote && !isAllowedLocal) {
    throw new Error(
      'VITE_SUPABASE_URL debe ser un proyecto Supabase remoto con HTTPS o un loopback permitido en desarrollo.',
    )
  }

  return {
    url: parsedUrl.origin,
    publishableKey,
  }
}

export function getSupabaseEnv(): SupabaseEnv {
  return validateSupabaseEnv(
    {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    import.meta.env.DEV,
  )
}
