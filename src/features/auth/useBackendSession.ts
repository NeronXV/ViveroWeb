import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createBackendSessionController, type BackendSessionAccess } from './backend-session'
import { bindBackendSession } from './backend-runtime'

// Used only inside the existing AuthProvider, never as a second provider.
export function useBackendSession(): BackendSessionAccess {
  const [controller] = useState(() => createBackendSessionController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => bindBackendSession(controller.getSnapshot), [controller])
  useEffect(() => {
    if (!state.session) return
    const timer = window.setTimeout(controller.expire, Math.max(0, state.session.expiresAt - Date.now()))
    const check = () => { controller.expire(); if (document.visibilityState === 'visible') void controller.refresh() }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [controller, state.session])
  // The controller remains reusable during StrictMode effect remounts.
  useEffect(() => {
    const clear = () => { void controller.signOut() }
    window.addEventListener('pagehide', clear)
    return () => { window.removeEventListener('pagehide', clear); void controller.signOut() }
  }, [controller])
  return useMemo(() => ({ ...state, signIn: controller.signIn, signOut: controller.signOut, refresh: controller.refresh, clearError: controller.clearError }), [state, controller])
}
