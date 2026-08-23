export const ACCESS_STATES = ['ACTIVE', 'PROFILE_MISSING', 'PROFILE_INACTIVE', 'NO_ROLE'] as const

export type AccessState = (typeof ACCESS_STATES)[number]

export const USER_ROLES = ['SALES', 'CASHIER', 'INVENTORY', 'MANAGER', 'ADMIN', 'OWNER'] as const

export type UserRole = (typeof USER_ROLES)[number]

export interface AccessProfile {
  fullName: string
  avatarPath: string | null
  isActive: boolean
}

export interface AccessBranch {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface AccessRole {
  name: UserRole
  displayName: string
}

export interface UserAccessContext {
  schemaVersion: 1
  userId: string
  accessState: AccessState
  profile: AccessProfile | null
  branch: AccessBranch | null
  role: AccessRole | null
  capabilities: string[]
}

export type AccessStatus = 'idle' | 'loading' | 'ready' | 'error'
