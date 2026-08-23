import { AuthApiError } from '@supabase/supabase-js'

const INVALID_CREDENTIAL_CODES = new Set([
  'invalid_credentials',
  'email_not_confirmed',
  'user_not_found',
])

export function getSafeAuthError(
  error: unknown,
  fallback = 'No fue posible completar la operación de autenticación.',
): string {
  if (error instanceof AuthApiError && INVALID_CREDENTIAL_CODES.has(error.code ?? '')) {
    return 'Correo o contraseña incorrectos.'
  }

  if (error instanceof TypeError) {
    return 'No fue posible conectar con el servicio de autenticación.'
  }

  return fallback
}
