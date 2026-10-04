import { BackendAuthError, createBackendAuthService, type BackendAccessContext } from './backend-auth-service'

export interface BackendSession {
  readonly accessToken: string
  readonly expiresAt: number
  readonly userId: number
}
export interface BackendSessionState {
  readonly session: BackendSession | null
  readonly context: BackendAccessContext | null
  readonly status: 'anonymous' | 'authenticating' | 'authenticated'
  readonly accessStatus: 'idle' | 'loading' | 'ready' | 'error'
  readonly busy: boolean
  readonly error: string | null
}
export interface BackendSessionAccess extends BackendSessionState {
  signIn(email: string, password: string): Promise<boolean>
  signOut(): Promise<boolean>
  refresh(): Promise<boolean>
  clearError(): void
}
const empty = (): BackendSessionState => ({ session: null, context: null, status: 'anonymous', accessStatus: 'idle', busy: false, error: null })
const safeError = (error: unknown) => error instanceof BackendAuthError ? error.message : 'No fue posible conectar con el servicio de acceso.'

// One instance owned by AuthProvider. No module-level session, token storage,
// automatic password retries, identity mapping, or fallback to Supabase.
export function createBackendSessionController(request: typeof fetch = fetch, now: () => number = Date.now) {
  const auth = createBackendAuthService(request), listeners = new Set<() => void>()
  let state: BackendSessionState = Object.freeze(empty()), revision = 0, active: AbortController | null = null, disposed = false
  function publish(next: BackendSessionState) {
    if (disposed) return
    state = Object.freeze(next)
    for (const listener of listeners) listener()
  }
  function clear(error: string | null = null) {
    revision += 1
    active?.abort(); active = null
    publish({ ...empty(), error })
  }
  async function revoke(token: string) {
    try { await auth.logout(token, AbortSignal.timeout(8000)); return true } catch { return false }
  }
  function current(expected: number) { return !disposed && revision === expected }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => state,
    clearError() { publish({ ...state, error: null }) },
    async signIn(email: string, password: string): Promise<boolean> {
      if (disposed || state.busy || state.session) return false
      const expected = ++revision, controller = new AbortController()
      active?.abort(); active = controller
      publish({ ...empty(), status: 'authenticating', busy: true })
      let token: string | null = null
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
        const startedAt = now(), login = await auth.login(email.trim(), password, signal)
        token = login.accessToken
        if (!current(expected)) { await revoke(token); return false }
        const context = await auth.context(token, undefined, signal)
        const expiresAt = startedAt + login.expiresIn * 1000
        if (!current(expected)) { await revoke(token); return false }
        if (now() >= expiresAt) { clear('La sesión venció. Inicia sesión nuevamente.'); await revoke(token); return false }
        const session = Object.freeze({ accessToken: token, expiresAt, userId: context.user.id })
        publish({ session, context, status: 'authenticated', accessStatus: 'ready', busy: false, error: null })
        return true
      } catch (error) {
        if (token) await revoke(token)
        if (current(expected)) publish({ ...empty(), error: safeError(error) })
        return false
      } finally { if (current(expected)) active = null }
    },
    async refresh(): Promise<boolean> {
      const session = state.session
      if (disposed || !session || state.busy) return false
      if (now() >= session.expiresAt) { clear('La sesión venció. Inicia sesión nuevamente.'); return false }
      const expected = ++revision, controller = new AbortController()
      active?.abort(); active = controller
      // Keep the identity/token on network failure, but grant no previous access.
      publish({ session, context: null, status: 'authenticated', accessStatus: 'loading', busy: true, error: null })
      try {
        const context = await auth.context(session.accessToken, session.userId, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
        if (!current(expected)) return false
        if (now() >= session.expiresAt) { clear('La sesión venció. Inicia sesión nuevamente.'); return false }
        publish({ session, context, status: 'authenticated', accessStatus: 'ready', busy: false, error: null })
        return true
      } catch (error) {
        if (!current(expected)) return false
        if (error instanceof BackendAuthError && error.status === 401) clear('La sesión dejó de ser válida. Inicia sesión nuevamente.')
        else publish({ session, context: null, status: 'authenticated', accessStatus: 'error', busy: false, error: safeError(error) })
        return false
      } finally { if (current(expected)) active = null }
    },
    expire() {
      if (state.session && now() >= state.session.expiresAt) clear('La sesión venció. Inicia sesión nuevamente.')
    },
    async signOut(): Promise<boolean> {
      const token = state.session?.accessToken
      clear() // Immediately invalidate permissions and late responses, even offline.
      return token ? revoke(token) : true
    },
    dispose() {
      const token = state.session?.accessToken
      clear(); disposed = true; listeners.clear()
      if (token) void revoke(token)
    },
  }
}
export type BackendSessionController = ReturnType<typeof createBackendSessionController>
