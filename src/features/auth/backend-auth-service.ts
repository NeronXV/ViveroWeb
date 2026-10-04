import { USER_ROLES, type UserRole } from '../access/access-types'

export interface BackendAccessContext {
  schema_version: 1
  user: { id: number; email: string; full_name: string }
  access_state: 'ACTIVE' | 'NO_ROLE'
  role: { id: number; name: UserRole; display_name: string } | null
  branch: { id: number; code: string; name: string; is_active: boolean } | null
  capabilities: string[]
}

export class BackendAuthError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'Correo, contraseña o sesión no válidos.'
      : status === 429 ? 'Demasiados intentos. Espera antes de volver a intentar.'
        : 'No fue posible completar la operación de autenticación.')
  }
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new BackendAuthError(502)
  return value as Record<string, unknown>
}
function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new BackendAuthError(502)
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new BackendAuthError(502)
  return value
}
function token(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new BackendAuthError(502)
  return value
}
export function parseBackendAccess(value: unknown): BackendAccessContext {
  const root = record(value, ['schema_version', 'user', 'access_state', 'role', 'branch', 'capabilities'])
  if (root.schema_version !== 1 || !['ACTIVE', 'NO_ROLE'].includes(String(root.access_state))) throw new BackendAuthError(502)
  const user = record(root.user, ['id', 'email', 'full_name'])
  let role: BackendAccessContext['role'] = null
  if (root.role !== null) {
    const r = record(root.role, ['id', 'name', 'display_name'])
    if (!USER_ROLES.some(name => name === r.name)) throw new BackendAuthError(502)
    role = { id: id(r.id), name: r.name as UserRole, display_name: text(r.display_name) }
  }
  let branch: BackendAccessContext['branch'] = null
  if (root.branch !== null) {
    const b = record(root.branch, ['id', 'code', 'name', 'is_active'])
    if (typeof b.is_active !== 'boolean') throw new BackendAuthError(502)
    branch = { id: id(b.id), code: text(b.code), name: text(b.name), is_active: b.is_active }
  }
  if (!Array.isArray(root.capabilities) || root.capabilities.some(c => typeof c !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(c))
    || new Set(root.capabilities).size !== root.capabilities.length
    || (root.access_state === 'ACTIVE') !== (role !== null)
    || (root.access_state === 'NO_ROLE' && root.capabilities.length !== 0)) throw new BackendAuthError(502)
  return { schema_version: 1, user: { id: id(user.id), email: text(user.email), full_name: text(user.full_name) },
    access_state: root.access_state as BackendAccessContext['access_state'], role, branch, capabilities: [...root.capabilities] as string[] }
}

// Same-origin Vite/reverse proxy. No persistent token storage or second provider.
export function createBackendAuthService(request: typeof fetch = fetch) {
  async function json(path: string, method: string, bearer?: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await request(`/api/v1/auth/${path}`, {
      method, signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${token(bearer)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new BackendAuthError(response.status)
    try { return await response.json() as unknown } catch { throw new BackendAuthError(502) }
  }
  return {
    async login(email: string, password: string, signal?: AbortSignal) {
      const result = record(await json('login', 'POST', undefined, { email, password }, signal), ['token_type', 'access_token', 'expires_in'])
      if (result.token_type !== 'Bearer' || result.expires_in !== 3600) throw new BackendAuthError(502)
      return { accessToken: token(result.access_token), expiresIn: 3600 }
    },
    async context(accessToken: string, expectedUserId?: number, signal?: AbortSignal) {
      const context = parseBackendAccess(await json('me', 'GET', accessToken, undefined, signal))
      if (expectedUserId !== undefined && context.user.id !== id(expectedUserId)) throw new BackendAuthError(502)
      return context
    },
    async logout(accessToken: string, signal?: AbortSignal) {
      const result = record(await json('logout', 'POST', accessToken, undefined, signal), ['signed_out'])
      if (result.signed_out !== true) throw new BackendAuthError(502)
    },
  }
}
