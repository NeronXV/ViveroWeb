import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { getSupabaseClient } from '../../lib/supabase/client'
import { AuthContext } from './auth-context'
import { getSafeAuthError } from './auth-errors'
import type { AuthStatus, AuthUser } from './auth-types'

function toAuthUser(session: Session | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [operationInProgress, setOperationInProgress] = useState(false)
  const mountedRef = useRef(false)
  const operationRef = useRef(false)

  const applySession = useCallback((session: Session | null) => {
    if (!mountedRef.current) return

    setUser(toAuthUser(session))
    setStatus(session ? 'authenticated' : 'anonymous')
    setError(null)
  }, [])

  useEffect(() => {
    let active = true
    let authEventRevision = 0
    mountedRef.current = true

    let client

    try {
      client = getSupabaseClient()
    } catch {
      setStatus('error')
      setError('La autenticación no está configurada en este entorno.')
      return () => {
        active = false
        mountedRef.current = false
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      authEventRevision += 1
      if (active) applySession(session)
    })

    const restoreRevision = authEventRevision

    void client.auth.getSession()
      .then(({ data, error: restoreError }) => {
        if (!active || authEventRevision !== restoreRevision) return

        if (restoreError) {
          setUser(null)
          setStatus('error')
          setError(getSafeAuthError(restoreError, 'No fue posible restaurar la sesión.'))
          return
        }

        applySession(data.session)
      })
      .catch((restoreError: unknown) => {
        if (!active || authEventRevision !== restoreRevision) return
        setUser(null)
        setStatus('error')
        setError(getSafeAuthError(restoreError, 'No fue posible restaurar la sesión.'))
      })

    return () => {
      active = false
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (operationRef.current) return false

    operationRef.current = true
    if (mountedRef.current) {
      setOperationInProgress(true)
      setError(null)
    }

    try {
      const client = getSupabaseClient()
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (!mountedRef.current) return false

      if (signInError || !data.session) {
        setUser(null)
        setStatus('anonymous')
        setError(getSafeAuthError(signInError, 'Correo o contraseña incorrectos.'))
        return false
      }

      applySession(data.session)
      return true
    } catch (signInError) {
      if (mountedRef.current) {
        setUser(null)
        setStatus('anonymous')
        setError(getSafeAuthError(signInError))
      }
      return false
    } finally {
      operationRef.current = false
      if (mountedRef.current) setOperationInProgress(false)
    }
  }, [applySession])

  const signOut = useCallback(async () => {
    if (operationRef.current) return false

    operationRef.current = true
    if (mountedRef.current) {
      setOperationInProgress(true)
      setError(null)
    }

    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()

      if (!mountedRef.current) return false

      if (signOutError) {
        setError(getSafeAuthError(signOutError, 'No fue posible cerrar la sesión.'))
        return false
      }

      setUser(null)
      setStatus('anonymous')
      setError(null)
      return true
    } catch (signOutError) {
      if (mountedRef.current) {
        setError(getSafeAuthError(signOutError, 'No fue posible cerrar la sesión.'))
      }
      return false
    } finally {
      operationRef.current = false
      if (mountedRef.current) setOperationInProgress(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setStatus((current) => current === 'error' && !user ? 'anonymous' : current)
  }, [user])

  const value = useMemo(() => ({
    status,
    user,
    error,
    operationInProgress,
    signInWithPassword,
    signOut,
    clearError,
  }), [clearError, error, operationInProgress, signInWithPassword, signOut, status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
