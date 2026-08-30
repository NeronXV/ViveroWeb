import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { getSupabaseClient } from '../../lib/supabase/client'
import { loadMyAccessContext } from '../access/access-service'
import type { AccessStatus, UserAccessContext } from '../access/access-types'
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
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('idle')
  const [accessContext, setAccessContext] = useState<UserAccessContext | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessRefreshRevision, setAccessRefreshRevision] = useState(0)
  const [operationInProgress, setOperationInProgress] = useState(false)
  const mountedRef = useRef(false)
  const operationRef = useRef(false)
  const identityUserIdRef = useRef<string | null>(null)
  const accessRequestRevisionRef = useRef(0)

  const clearAccess = useCallback(() => {
    accessRequestRevisionRef.current += 1
    if (!mountedRef.current) return
    setAccessStatus('idle')
    setAccessContext(null)
    setAccessError(null)
  }, [])

  const applySession = useCallback((session: Session | null) => {
    if (!mountedRef.current) return

    const nextUser = toAuthUser(session)
    if (identityUserIdRef.current !== nextUser?.id) clearAccess()
    identityUserIdRef.current = nextUser?.id ?? null
    setUser(nextUser)
    setStatus(session ? 'authenticated' : 'anonymous')
    setError(null)
  }, [clearAccess])

  useEffect(() => {
    let active = true
    let restorationComplete = false
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
      if (active && restorationComplete) applySession(session)
    })

    void client.auth.getSession()
      .then(async ({ data, error: restoreError }) => {
        if (!active) return

        if (restoreError) {
          restorationComplete = true
          identityUserIdRef.current = null
          clearAccess()
          setUser(null)
          setStatus('error')
          setError(getSafeAuthError(restoreError, 'No fue posible restaurar la sesión.'))
          return
        }

        if (data.session) {
          const { data: refreshedSession, error: verificationError } = await client.auth.refreshSession(data.session)
          if (!active) return

          if (verificationError || !refreshedSession.session || refreshedSession.session.user.id !== data.session.user.id) {
            restorationComplete = true
            identityUserIdRef.current = null
            clearAccess()
            setUser(null)
            setStatus('anonymous')
            setError('La sesión venció o dejó de ser válida. Inicia sesión nuevamente.')
            void client.auth.signOut({ scope: 'local' })
            return
          }

          restorationComplete = true
          applySession(refreshedSession.session)
          return
        }

        restorationComplete = true
        applySession(data.session)
      })
      .catch((restoreError: unknown) => {
        if (!active) return
        restorationComplete = true
        identityUserIdRef.current = null
        clearAccess()
        setUser(null)
        setStatus('error')
        setError(getSafeAuthError(restoreError, 'No fue posible restaurar la sesión.'))
      })

    return () => {
      active = false
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [applySession, clearAccess])

  const authenticatedUserId = status === 'authenticated' ? user?.id ?? null : null

  useEffect(() => {
    if (!authenticatedUserId) return

    let active = true
    const expectedUserId = authenticatedUserId
    const requestRevision = ++accessRequestRevisionRef.current
    setAccessStatus('loading')
    setAccessContext(null)
    setAccessError(null)

    void loadMyAccessContext()
      .then((context) => {
        if (!active || !mountedRef.current || accessRequestRevisionRef.current !== requestRevision) return
        if (identityUserIdRef.current !== expectedUserId || context.userId !== expectedUserId) {
          setAccessStatus('error')
          setAccessContext(null)
          setAccessError('El contexto recibido no corresponde a la sesión actual.')
          return
        }
        setAccessStatus('ready')
        setAccessContext(context)
        setAccessError(null)
      })
      .catch(() => {
        if (!active || !mountedRef.current || accessRequestRevisionRef.current !== requestRevision) return
        setAccessStatus('error')
        setAccessContext(null)
        setAccessError('No fue posible cargar tu contexto de acceso. La sesión continúa activa sin permisos habilitados.')
      })

    return () => {
      active = false
      if (accessRequestRevisionRef.current === requestRevision) accessRequestRevisionRef.current += 1
    }
  }, [accessRefreshRevision, authenticatedUserId])

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
        identityUserIdRef.current = null
        clearAccess()
        setUser(null)
        setStatus('anonymous')
        setError(getSafeAuthError(signInError))
        return false
      }

      applySession(data.session)
      return true
    } catch (signInError) {
      if (mountedRef.current) {
        identityUserIdRef.current = null
        clearAccess()
        setUser(null)
        setStatus('anonymous')
        setError(getSafeAuthError(signInError))
      }
      return false
    } finally {
      operationRef.current = false
      if (mountedRef.current) setOperationInProgress(false)
    }
  }, [applySession, clearAccess])

  const signOut = useCallback(async () => {
    if (operationRef.current) return false

    operationRef.current = true
    if (mountedRef.current) {
      setOperationInProgress(true)
      setError(null)
      clearAccess()
    }

    const finishLocalSignOut = () => {
      identityUserIdRef.current = null
      setUser(null)
      setStatus('anonymous')
      setError(null)
    }

    const clearLocalSession = async () => {
      const { error: localSignOutError } = await getSupabaseClient().auth.signOut({ scope: 'local' })
      if (localSignOutError) throw localSignOutError
      finishLocalSignOut()
      return true
    }

    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut()

      if (!mountedRef.current) return false

      if (signOutError) {
        return await clearLocalSession()
      }

      finishLocalSignOut()
      return true
    } catch (signOutError) {
      if (mountedRef.current) {
        try {
          return await clearLocalSession()
        } catch {
          setError(getSafeAuthError(signOutError, 'No fue posible cerrar la sesión.'))
          setAccessRefreshRevision((current) => current + 1)
        }
      }
      return false
    } finally {
      operationRef.current = false
      if (mountedRef.current) setOperationInProgress(false)
    }
  }, [clearAccess])

  const clearError = useCallback(() => {
    setError(null)
    setStatus((current) => current === 'error' && !user ? 'anonymous' : current)
  }, [user])

  const refreshAccessContext = useCallback(() => {
    if (identityUserIdRef.current) setAccessRefreshRevision((current) => current + 1)
  }, [])

  const value = useMemo(() => ({
    status,
    user,
    error,
    accessStatus,
    accessContext,
    accessError,
    operationInProgress,
    signInWithPassword,
    signOut,
    clearError,
    refreshAccessContext,
  }), [accessContext, accessError, accessStatus, clearError, error, operationInProgress, refreshAccessContext, signInWithPassword, signOut, status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
