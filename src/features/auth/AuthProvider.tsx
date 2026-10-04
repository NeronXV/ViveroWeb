import { useMemo, type ReactNode } from 'react'
import { useBackendSession } from './useBackendSession'
import { AuthContext } from './auth-context'
import type { UserAccessContext } from '../access/access-types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackendSession()
  const value = useMemo(() => {
    const context = backend.context
    const accessContext: UserAccessContext | null = context ? {
      schemaVersion: 1, userId: String(context.user.id), accessState: context.access_state,
      profile: { fullName: context.user.full_name, avatarPath: null, isActive: true },
      role: context.role ? { name: context.role.name, displayName: context.role.display_name } : null,
      branch: context.branch ? { id: String(context.branch.id), code: context.branch.code, name: context.branch.name, isActive: context.branch.is_active } : null,
      capabilities: [...context.capabilities],
    } : null
    return { backend, status: backend.session ? 'authenticated' as const : 'anonymous' as const,
      user: backend.session ? { id: String(backend.session.userId), email: context?.user.email ?? null } : null,
      error: backend.error, accessStatus: backend.accessStatus, accessContext,
      accessError: backend.accessStatus === 'error' ? backend.error : null, operationInProgress: backend.busy,
      signInWithPassword: backend.signIn, signOut: backend.signOut, clearError: backend.clearError,
      refreshAccessContext: () => { void backend.refresh() } }
  }, [backend])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
