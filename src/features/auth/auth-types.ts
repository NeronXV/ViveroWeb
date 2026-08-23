import type { AccessStatus, UserAccessContext } from '../access/access-types'

export type AuthStatus = 'initializing' | 'anonymous' | 'authenticated' | 'error'

export interface AuthUser {
  id: string
  email: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  error: string | null
  accessStatus: AccessStatus
  accessContext: UserAccessContext | null
  accessError: string | null
  operationInProgress: boolean
  signInWithPassword: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<boolean>
  clearError: () => void
  refreshAccessContext: () => void
}
