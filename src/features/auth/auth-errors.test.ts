import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'

import { getSafeAuthError } from './auth-errors'

describe('getSafeAuthError', () => {
  it('oculta el detalle de credenciales inválidas', () => {
    expect(getSafeAuthError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')))
      .toBe('Correo o contraseña incorrectos.')
  })

  it('oculta si el correo todavía no fue confirmado', () => {
    expect(getSafeAuthError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed')))
      .toBe('Correo o contraseña incorrectos.')
  })

  it('distingue errores de red reintentables', () => {
    expect(getSafeAuthError(new AuthRetryableFetchError('Failed to fetch', 0)))
      .toBe('No fue posible conectar con el servicio de autenticación.')
  })

  it('distingue el timeout sintético del cliente', () => {
    expect(getSafeAuthError(new AuthApiError('Tiempo de espera agotado.', 408, undefined)))
      .toBe('No fue posible conectar con el servicio de autenticación.')
  })

  it('distingue errores temporales del servidor', () => {
    expect(getSafeAuthError(new AuthApiError('Service unavailable', 503, undefined)))
      .toBe('No fue posible conectar con el servicio de autenticación.')
  })

  it('mantiene un mensaje seguro para errores desconocidos', () => {
    expect(getSafeAuthError(new Error('internal detail')))
      .toBe('No fue posible completar la operación de autenticación.')
  })
})
