import {
  ACCESS_STATES,
  USER_ROLES,
  type AccessBranch,
  type AccessProfile,
  type AccessRole,
  type AccessState,
  type UserAccessContext,
  type UserRole,
} from './access-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAPABILITY_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new AccessContextValidationError(`El campo ${field} no es válido.`)
  }
  return value
}

function readUuid(value: unknown, field: string): string {
  const uuid = readNonEmptyString(value, field)
  if (!UUID_PATTERN.test(uuid)) throw new AccessContextValidationError(`El campo ${field} no es un UUID válido.`)
  return uuid
}

function readProfile(value: unknown): AccessProfile | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['fullName', 'avatarPath', 'isActive'])) {
    throw new AccessContextValidationError('El perfil no tiene el formato esperado.')
  }
  const avatarPath = value.avatarPath
  if (avatarPath !== null && typeof avatarPath !== 'string') {
    throw new AccessContextValidationError('La ruta del avatar no es válida.')
  }
  if (typeof value.isActive !== 'boolean') throw new AccessContextValidationError('El estado del perfil no es válido.')
  return {
    fullName: readNonEmptyString(value.fullName, 'profile.fullName'),
    avatarPath: avatarPath as string | null,
    isActive: value.isActive,
  }
}

function readBranch(value: unknown): AccessBranch | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'code', 'name', 'isActive'])) {
    throw new AccessContextValidationError('La sucursal no tiene el formato esperado.')
  }
  if (typeof value.isActive !== 'boolean') throw new AccessContextValidationError('El estado de la sucursal no es válido.')
  return {
    id: readUuid(value.id, 'branch.id'),
    code: readNonEmptyString(value.code, 'branch.code'),
    name: readNonEmptyString(value.name, 'branch.name'),
    isActive: value.isActive,
  }
}

function readRole(value: unknown): AccessRole | null {
  if (value === null) return null
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'displayName'])) {
    throw new AccessContextValidationError('El rol no tiene el formato esperado.')
  }
  if (typeof value.name !== 'string' || !USER_ROLES.includes(value.name as UserRole)) {
    throw new AccessContextValidationError('El rol no está permitido.')
  }
  return { name: value.name as UserRole, displayName: readNonEmptyString(value.displayName, 'role.displayName') }
}

function readCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AccessContextValidationError('Las capacidades no tienen el formato esperado.')
  const capabilities = value.map((item) => {
    if (typeof item !== 'string' || !CAPABILITY_PATTERN.test(item)) {
      throw new AccessContextValidationError('Se recibió una capacidad no válida.')
    }
    return item
  })
  if (new Set(capabilities).size !== capabilities.length) {
    throw new AccessContextValidationError('Las capacidades contienen duplicados.')
  }
  if (capabilities.some((capability, index) => index > 0 && capabilities[index - 1] > capability)) {
    throw new AccessContextValidationError('Las capacidades no tienen un orden determinista.')
  }
  return capabilities
}

function assertCoherentState(context: UserAccessContext): void {
  const { accessState, profile, branch, role, capabilities } = context
  if (accessState === 'PROFILE_MISSING' && (profile !== null || branch !== null || role !== null || capabilities.length > 0)) {
    throw new AccessContextValidationError('El estado de acceso no coincide con un perfil ausente.')
  }
  if (accessState === 'PROFILE_INACTIVE' && (profile === null || profile.isActive)) {
    throw new AccessContextValidationError('El estado de acceso no coincide con un perfil inactivo.')
  }
  if (accessState === 'NO_ROLE' && (profile === null || !profile.isActive || role !== null || capabilities.length > 0)) {
    throw new AccessContextValidationError('El estado de acceso no coincide con un usuario sin rol.')
  }
  if (accessState === 'ACTIVE' && (profile === null || !profile.isActive || role === null)) {
    throw new AccessContextValidationError('El estado activo no tiene perfil y rol válidos.')
  }
  if (accessState !== 'ACTIVE' && capabilities.length > 0) {
    throw new AccessContextValidationError('Un contexto no activo no puede tener capacidades.')
  }
}

export class AccessContextValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessContextValidationError'
  }
}

export function parseUserAccessContext(value: unknown): UserAccessContext {
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'userId', 'accessState', 'profile', 'branch', 'role', 'capabilities'])) {
    throw new AccessContextValidationError('El contexto de acceso no tiene el formato esperado.')
  }
  if (value.schemaVersion !== 1) throw new AccessContextValidationError('La versión del contexto de acceso no es compatible.')
  if (typeof value.accessState !== 'string' || !ACCESS_STATES.includes(value.accessState as AccessState)) {
    throw new AccessContextValidationError('El estado de acceso no está permitido.')
  }

  const context: UserAccessContext = {
    schemaVersion: 1,
    userId: readUuid(value.userId, 'userId'),
    accessState: value.accessState as AccessState,
    profile: readProfile(value.profile),
    branch: readBranch(value.branch),
    role: readRole(value.role),
    capabilities: readCapabilities(value.capabilities),
  }
  assertCoherentState(context)
  return context
}
