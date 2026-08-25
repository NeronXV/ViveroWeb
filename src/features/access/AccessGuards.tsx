import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { hasCapability } from './access-helpers'
import { ADMIN_ENTRY_CAPABILITIES, getLoginPath, hasAnyCapability, type ProtectedDestination } from './access-rules'
import { AccessDenied } from './AccessDenied'
import { useAuth } from '../auth/useAuth'

function StableAccessLoading() {
  const headingRef = useHeadingFocus<HTMLHeadingElement>('loading')
  useDocumentTitle('Verificando acceso')
  return <main className="internal-page access-boundary-page"><section className="login-card" aria-labelledby="access-loading-title" aria-busy="true"><p className="eyebrow">Acceso interno</p><h1 id="access-loading-title" ref={headingRef} tabIndex={-1}>Verificando acceso</h1><p role="status" aria-live="polite">Espera mientras confirmamos tu sesión y permisos.</p></section></main>
}

export function RequireSession({ returnTo, children }: { returnTo: ProtectedDestination; children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'initializing') return <StableAccessLoading />
  if (status === 'anonymous') return <Navigate to={getLoginPath(returnTo)} replace />
  if (status === 'error') return <AccessDenied reason="No fue posible verificar la sesión. Inicia sesión nuevamente." />
  return children
}

export function RequireAccessContext({ children }: { children: ReactNode }) {
  const { accessStatus, accessContext, accessError, refreshAccessContext } = useAuth()

  if (accessStatus === 'idle' || accessStatus === 'loading') return <StableAccessLoading />
  if (accessStatus === 'error' || !accessContext) {
    return <AccessDenied reason={accessError ?? 'No fue posible verificar tu contexto de acceso.'} onRetry={refreshAccessContext} />
  }

  if (accessContext.accessState === 'PROFILE_MISSING') return <AccessDenied reason="Tu cuenta no tiene un perfil configurado." />
  if (accessContext.accessState === 'PROFILE_INACTIVE') return <AccessDenied reason="Tu cuenta está desactivada." />
  if (accessContext.accessState === 'NO_ROLE') return <AccessDenied reason="Tu cuenta todavía no tiene un rol asignado." />
  if (accessContext.accessState !== 'ACTIVE') return <AccessDenied reason="Tu cuenta no tiene acceso habilitado." />

  return children
}

export function RequireCapability({ capabilities, mode = 'all', reason, children }: { capabilities: readonly string[]; mode?: 'all' | 'any'; reason: string; children: ReactNode }) {
  const { accessContext } = useAuth()
  const authorized = mode === 'all'
    ? capabilities.every((capability) => hasCapability(accessContext, capability))
    : hasAnyCapability(accessContext, capabilities)

  return authorized ? children : <AccessDenied reason={reason} />
}

export function RequireCashierAccess({ children }: { children: ReactNode }) {
  const { accessContext } = useAuth()

  if (!hasCapability(accessContext, 'OPERATE_CASHIER')) return <AccessDenied reason="No tienes permiso para operar Caja." />
  if (!accessContext?.branch) return <AccessDenied reason="Necesitas una sucursal asignada para operar Caja." />
  if (!accessContext.branch.isActive) return <AccessDenied reason="Tu sucursal asignada está inactiva." />
  return children
}

export function RequireAdminAccess({ children }: { children: ReactNode }) {
  return <RequireCapability capabilities={ADMIN_ENTRY_CAPABILITIES} mode="any" reason="No tienes permiso para acceder a Administración.">{children}</RequireCapability>
}
