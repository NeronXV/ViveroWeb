import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { hasCapability } from '../access/access-helpers'
import { USER_ROLES, type UserRole } from '../access/access-types'
import { useAdminBranches, useAdminStaff } from './useAdminDirectories'
import {
  createBranch,
  updateBranch,
  setBranchActive,
  assignUserBranch,
  assignUserRole,
  fetchAdminBranches,
  setUserActive,
  AdminServiceError,
} from './admin-service'
import type { AdminBranch, AdminStaffMember } from './admin-types'

function Feedback({
  status,
  error,
  retry,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  retry: () => void
}) {
  if (status === 'loading' || status === 'idle') {
    return <p role="status" aria-live="polite">Cargando datos administrativos…</p>
  }
  if (status === 'error') {
    return (
      <div className="admin-directory-error" role="alert">
        <p>{error}</p>
        <button type="button" className="retry-btn-secondary" onClick={retry}>
          Reintentar
        </button>
      </div>
    )
  }
  return null
}

export function isToggleActiveDisabled(
  actorId: string | null,
  actorRole: string | null,
  targetId: string,
  targetRole: string | null,
  isMutatingThisUser: boolean
): { disabled: boolean; reason: string | null } {
  if (isMutatingThisUser) {
    return { disabled: true, reason: 'Operación en curso para este usuario.' }
  }
  if (actorId === targetId) {
    return { disabled: true, reason: 'No puedes cambiar tu propio estado de activación.' }
  }
  if (actorRole === 'ADMIN' && targetRole === 'OWNER') {
    return { disabled: true, reason: 'Un Administrador no puede cambiar el estado de un Propietario.' }
  }
  return { disabled: false, reason: null }
}

export function isAssignDisabledForInactive(
  isActive: boolean
): { disabled: boolean; reason: string | null } {
  if (!isActive) {
    return { disabled: true, reason: 'Debes activar al usuario antes de modificar su asignación.' }
  }
  return { disabled: false, reason: null }
}

export function BranchDirectory({ active }: { active: boolean }) {
  const { accessContext } = useAuth()
  const directory = useAdminBranches(active)

  const canManageBranches = hasCapability(accessContext, 'MANAGE_BRANCHES')

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<AdminBranch | null>(null)

  // Campos
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const handleCreateOpen = () => {
    setCode('')
    setName('')
    setMutationError(null)
    setIsCreateOpen(true)
  }

  const handleEditOpen = (branch: AdminBranch) => {
    setEditingBranch(branch)
    setCode(branch.code)
    setName(branch.name)
    setMutationError(null)
    setIsEditOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsMutating(true)
    setMutationError(null)
    try {
      await createBranch({ code: code.trim(), name: name.trim() })
      setIsCreateOpen(false)
      directory.refresh()
    } catch (err) {
      setMutationError(err instanceof AdminServiceError ? err.message : 'Error desconocido al crear sucursal.')
    } finally {
      setIsMutating(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBranch) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await updateBranch({ id: editingBranch.id, code: code.trim(), name: name.trim() })
      setIsEditOpen(false)
      setEditingBranch(null)
      directory.refresh()
    } catch (err) {
      setMutationError(err instanceof AdminServiceError ? err.message : 'Error desconocido al actualizar sucursal.')
    } finally {
      setIsMutating(false)
    }
  }

  const handleToggleActive = async (branch: AdminBranch) => {
    const action = branch.isActive ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Estás seguro de que deseas ${action} la sucursal "${branch.name}"?`)) {
      return
    }
    try {
      await setBranchActive(branch.id, !branch.isActive)
      directory.refresh()
    } catch (err) {
      alert(err instanceof AdminServiceError ? err.message : 'Error al cambiar estado de la sucursal.')
    }
  }

  const [branchSearch, setBranchSearch] = useState('')

  const filteredBranches = directory.items.filter((b) => {
    if (!branchSearch.trim()) return true
    const q = branchSearch.trim().toLowerCase()
    return b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)
  })

  const totalStaffCount = directory.items.reduce((acc, b) => acc + b.activeStaffCount, 0)
  const totalPendingSales = directory.items.reduce((acc, b) => acc + b.pendingSaleCount, 0)

  return (
    <section className="db-tab-content active" aria-busy={directory.status === 'loading' || directory.loadingMore}>
      <div className="section-header-row">
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🏬</span> Directorio de Sucursales
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Gestión centralizada de ubicaciones físicas y asignaciones operativas en Supabase.
          </p>
        </div>
        {canManageBranches && (
          <button type="button" className="catalog-action" onClick={handleCreateOpen}>
            + Crear Sucursal
          </button>
        )}
      </div>

      <Feedback status={directory.status} error={directory.error} retry={directory.retry} />

      {directory.status === 'ready' && (
        <>
          {/* KPI Metrics */}
          <div className="stock-kpi-bar" style={{ marginTop: '1rem' }}>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                🏬
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.length}</span>
                <span className="stock-kpi-label">Total Sucursales</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                🟢
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.filter((b) => b.isActive).length}</span>
                <span className="stock-kpi-label">Sucursales Activas</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                👥
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{totalStaffCount}</span>
                <span className="stock-kpi-label">Personal en Turno</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                ⏳
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{totalPendingSales}</span>
                <span className="stock-kpi-label">Ventas Pendientes</span>
              </div>
            </div>
          </div>

          {/* Search Toolbar */}
          <div className="stock-filter-toolbar" style={{ marginTop: '1rem' }}>
            <div className="stock-search-box" style={{ maxWidth: '380px' }}>
              <span className="stock-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar por código o nombre..."
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
              />
              {branchSearch && (
                <button
                  type="button"
                  className="stock-search-clear"
                  onClick={() => setBranchSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Mostrando {filteredBranches.length} de {directory.items.length} sucursales
            </span>
          </div>
        </>
      )}

      {directory.status === 'ready' && directory.items.length === 0 && (
        <div className="promo-empty-card" style={{ marginTop: '1.25rem' }}>
          <div className="promo-empty-icon">🏬</div>
          <div style={{ maxWidth: '440px' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>No hay sucursales registradas</h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Crea tu primera sucursal para asignar personal, gestionar inventario local y procesar ventas.
            </p>
          </div>
          {canManageBranches && (
            <button type="button" className="catalog-action" style={{ marginTop: '0.5rem' }} onClick={handleCreateOpen}>
              + Crear Primera Sucursal
            </button>
          )}
        </div>
      )}

      {filteredBranches.length > 0 && (
        <div className="botanical-section-card" style={{ marginTop: '1.25rem' }}>
          <div className="botanical-section-header">
            <span>🏬</span>
            <h4>Ubicaciones Físicas ({filteredBranches.length})</h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre de Sucursal</th>
                  <th style={{ textAlign: 'center' }}>Personal Activo</th>
                  <th style={{ textAlign: 'center' }}>Ventas Pendientes</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                  {canManageBranches && <th style={{ textAlign: 'center' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map((branch) => (
                  <tr key={branch.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary-color)' }}>
                      {branch.code}
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{branch.name}</strong>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      <span
                        style={{
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#3b82f6',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '16px',
                          fontSize: '0.8rem',
                        }}
                      >
                        👥 {branch.activeStaffCount}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          background: branch.pendingSaleCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-color)',
                          color: branch.pendingSaleCount > 0 ? '#f59e0b' : 'var(--text-secondary)',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '16px',
                          fontSize: '0.8rem',
                          fontWeight: branch.pendingSaleCount > 0 ? 700 : 500,
                        }}
                      >
                        {branch.pendingSaleCount > 0 ? `⏳ ${branch.pendingSaleCount}` : '0'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '16px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          background: branch.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: branch.isActive ? '#10b981' : '#ef4444',
                          display: 'inline-block',
                        }}
                      >
                        {branch.isActive ? '🟢 Activa' : '🔴 Inactiva'}
                      </span>
                    </td>
                    {canManageBranches && (
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="mini-action-btn primary"
                            onClick={() => handleEditOpen(branch)}
                            title="Editar sucursal"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="mini-action-btn"
                            style={{
                              borderColor: branch.isActive ? 'rgba(239, 68, 68, 0.4)' : '#10b981',
                              color: branch.isActive ? '#ef4444' : '#10b981',
                            }}
                            onClick={() => handleToggleActive(branch)}
                          >
                            {branch.isActive ? 'Pausar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {directory.hasMore && (
        <button
          type="button"
          className="retry-btn-secondary admin-load-more"
          onClick={directory.loadMore}
          disabled={directory.loadingMore}
        >
          {directory.loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      )}

      {directory.error && directory.status === 'ready' && (
        <p className="admin-page-error" role="alert">{directory.error}</p>
      )}

      {/* Modal de Creación */}
      {isCreateOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="create-modal-title">Crear Sucursal</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsCreateOpen(false)}>
                &times;
              </button>
            </div>
            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleCreateSubmit}>
              <div className="admin-form-group">
                <label htmlFor="create-code">Código de Sucursal (letras mayúsculas, números, guiones)</label>
                <input
                  id="create-code"
                  type="text"
                  required
                  maxLength={24}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ej. CENTRO"
                  disabled={isMutating}
                />
              </div>
              <div className="admin-form-group">
                <label htmlFor="create-name">Nombre de la Sucursal</label>
                <input
                  id="create-name"
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Sucursal Centro"
                  disabled={isMutating}
                />
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={isMutating}>
                  {isMutating ? 'Guardando…' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edición */}
      {isEditOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="edit-modal-title">Editar Sucursal</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsEditOpen(false)}>
                &times;
              </button>
            </div>
            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleEditSubmit}>
              <div className="admin-form-group">
                <label htmlFor="edit-code">Código de Sucursal</label>
                <input
                  id="edit-code"
                  type="text"
                  required
                  maxLength={24}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={isMutating}
                />
              </div>
              <div className="admin-form-group">
                <label htmlFor="edit-name">Nombre de la Sucursal</label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isMutating}
                />
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsEditOpen(false)}
                  disabled={isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={isMutating}>
                  {isMutating ? 'Guardando…' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export function StaffDirectory({ active, canAssignRoles }: { active: boolean; canAssignRoles: boolean }) {
  const { accessContext } = useAuth()
  const directory = useAdminStaff(active)

  const canManageUsers = hasCapability(accessContext, 'MANAGE_USERS')

  // Modales
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [isConfirmActiveOpen, setIsConfirmActiveOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<AdminStaffMember | null>(null)
  const [confirmingStaff, setConfirmingStaff] = useState<AdminStaffMember | null>(null)

  // Combos
  const [branchId, setBranchId] = useState('')
  const [roleName, setRoleName] = useState('')
  const [branchesList, setBranchesList] = useState<AdminBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  // Mutaciones
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [ariaNotification, setAriaNotification] = useState<string | null>(null)

  // Cargar sucursales para asignar
  useEffect(() => {
    if (isBranchModalOpen) {
      setLoadingBranches(true)
      fetchAdminBranches(null)
        .then((res) => {
          // Filtrar sólo sucursales activas para asignar
          setBranchesList(res.items.filter((b) => b.isActive))
        })
        .catch(() => {
          alert('No fue posible cargar las sucursales para asignación.')
        })
        .finally(() => {
          setLoadingBranches(false)
        })
    }
  }, [isBranchModalOpen])

  const handleBranchOpen = (staff: AdminStaffMember) => {
    setSelectedStaff(staff)
    setBranchId(staff.branch?.id || '')
    setMutationError(null)
    setIsBranchModalOpen(true)
  }

  const handleRoleOpen = (staff: AdminStaffMember) => {
    setSelectedStaff(staff)
    setRoleName(staff.role?.name || '')
    setMutationError(null)
    setIsRoleModalOpen(true)
  }

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await assignUserBranch({ userId: selectedStaff.id, branchId })
      setIsBranchModalOpen(false)
      setSelectedStaff(null)
      directory.refresh()
    } catch (err) {
      setMutationError(err instanceof AdminServiceError ? err.message : 'Error al asignar sucursal.')
    } finally {
      setIsMutating(false)
    }
  }

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await assignUserRole({ userId: selectedStaff.id, role: roleName as UserRole })
      setIsRoleModalOpen(false)
      setSelectedStaff(null)
      directory.refresh()
    } catch (err) {
      setMutationError(err instanceof AdminServiceError ? err.message : 'Error al asignar rol.')
    } finally {
      setIsMutating(false)
    }
  }

  const isMutatingUser = (memberId: string): boolean => {
    return isMutating && (selectedStaff?.id === memberId || confirmingStaff?.id === memberId)
  }

  const handleToggleActiveOpen = (staff: AdminStaffMember) => {
    setConfirmingStaff(staff)
    setMutationError(null)
    setIsConfirmActiveOpen(true)
  }

  const handleToggleActiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmingStaff) return
    setIsMutating(true)
    setMutationError(null)
    try {
      const nextActive = !confirmingStaff.isActive
      await setUserActive(confirmingStaff.id, nextActive)

      const actionText = nextActive ? 'activado' : 'desactivado'
      setAriaNotification(`El trabajador ${confirmingStaff.fullName} ha sido ${actionText} con éxito.`)
      setTimeout(() => {
        setAriaNotification(null)
      }, 5000)

      setIsConfirmActiveOpen(false)
      setConfirmingStaff(null)
      directory.refresh()
    } catch (err) {
      setMutationError(err instanceof AdminServiceError ? err.message : 'Error al cambiar el estado del trabajador.')
    } finally {
      setIsMutating(false)
    }
  }

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Filtrado de personal
  const filteredStaff = directory.items.filter((member) => {
    if (filterStatus === 'active' && !member.isActive) return false
    if (filterStatus === 'inactive' && member.isActive) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const matchName = member.fullName.toLowerCase().includes(q)
    const matchRole =
      (member.role?.displayName && member.role.displayName.toLowerCase().includes(q)) ||
      (member.role?.name && member.role.name.toLowerCase().includes(q))
    const matchBranch =
      (member.branch?.name && member.branch.name.toLowerCase().includes(q)) ||
      (member.branch?.code && member.branch.code.toLowerCase().includes(q))
    return matchName || Boolean(matchRole) || Boolean(matchBranch)
  })

  // Refleja la jerarquía autoritativa: ADMIN no puede modificar OWNER.
  const isProtectedByHierarchy = (member: AdminStaffMember): boolean => {
    const callerRole = accessContext?.role?.name
    if (callerRole === 'ADMIN') {
      return member.role?.name === 'OWNER'
    }
    return false
  }

  // Evitar que el usuario logueado se cambie su propio rol o sucursal por accidente
  const isSelf = (member: AdminStaffMember): boolean => {
    return member.id === accessContext?.userId
  }

  const isRoleOptionAllowed = (role: string): boolean => {
    const callerRole = accessContext?.role?.name
    if (callerRole === 'ADMIN') {
      return role !== 'OWNER'
    }
    return true
  }

  const getRoleBadgeStyle = (roleName?: string) => {
    switch (roleName) {
      case 'OWNER':
        return { background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }
      case 'ADMIN':
        return { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }
      case 'CASHIER':
        return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }
      case 'INVENTORY':
        return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }
      default:
        return { background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--surface-border)' }
    }
  }

  return (
    <section className="db-tab-content active" aria-busy={directory.status === 'loading' || directory.loadingMore}>
      <div className="section-header-row">
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>👥</span> Personal y Roles
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Directorio institucional de Supabase. Acciones de asignación protegidas por jerarquía.
          </p>
        </div>
      </div>

      <Feedback status={directory.status} error={directory.error} retry={directory.retry} />

      {directory.status === 'ready' && (
        <>
          {/* KPI Metrics */}
          <div className="stock-kpi-bar" style={{ marginTop: '1rem' }}>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                👥
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.length}</span>
                <span className="stock-kpi-label">Total Personal</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                🟢
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.filter((m) => m.isActive).length}</span>
                <span className="stock-kpi-label">Personal Activo</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                🔴
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.filter((m) => !m.isActive).length}</span>
                <span className="stock-kpi-label">Inactivos / Pausados</span>
              </div>
            </div>
            <div className="stock-kpi-card">
              <div className="stock-kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                🏬
              </div>
              <div className="stock-kpi-info">
                <span className="stock-kpi-value">{directory.items.filter((m) => m.branch !== null).length}</span>
                <span className="stock-kpi-label">Con Sucursal Asignada</span>
              </div>
            </div>
          </div>

          {/* Toolbar Search & Status Filter */}
          <div className="stock-filter-toolbar" style={{ marginTop: '1rem' }}>
            <div className="stock-search-box" style={{ maxWidth: '380px' }}>
              <span className="stock-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar por nombre, rol o sucursal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="stock-search-clear"
                  onClick={() => setSearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="stock-status-chips">
              <button
                type="button"
                className={`stock-filter-chip ${filterStatus === 'all' ? 'active' : ''}`}
                onClick={() => setFilterStatus('all')}
              >
                Todos ({directory.items.length})
              </button>
              <button
                type="button"
                className={`stock-filter-chip ${filterStatus === 'active' ? 'active' : ''}`}
                onClick={() => setFilterStatus('active')}
              >
                🟢 Activos ({directory.items.filter((m) => m.isActive).length})
              </button>
              <button
                type="button"
                className={`stock-filter-chip ${filterStatus === 'inactive' ? 'active' : ''}`}
                onClick={() => setFilterStatus('inactive')}
              >
                🔴 Inactivos ({directory.items.filter((m) => !m.isActive).length})
              </button>
            </div>
          </div>
        </>
      )}

      {directory.items.length === 0 && directory.status === 'ready' && (
        <div className="promo-empty-card" style={{ marginTop: '1.25rem' }}>
          <div className="promo-empty-icon">👥</div>
          <div style={{ maxWidth: '440px' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>No hay personal registrado en el directorio</h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Los usuarios que se registren en la plataforma aparecerán aquí para asignarles rol y sucursal de trabajo.
            </p>
          </div>
        </div>
      )}

      {filteredStaff.length > 0 && (
        <div className="botanical-section-card" style={{ marginTop: '1.25rem' }}>
          <div className="botanical-section-header">
            <span>📋</span>
            <h4>Directorio de Trabajadores ({filteredStaff.length})</h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Rol Institucional</th>
                  <th>Sucursal Asignada</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                  {(canManageUsers || canAssignRoles) && <th style={{ textAlign: 'center' }}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => {
                  const disabledByHierarchy = isProtectedByHierarchy(member)
                  const disabledSelf = isSelf(member)
                  const disabledByMutation = isMutatingUser(member.id)
                  const cannotModify = disabledByHierarchy || disabledSelf || disabledByMutation
                  const inactiveAssignCheck = isAssignDisabledForInactive(member.isActive)
                  const isAssignDisabled = cannotModify || inactiveAssignCheck.disabled

                  const activeCheck = isToggleActiveDisabled(
                    accessContext?.userId ?? null,
                    accessContext?.role?.name ?? null,
                    member.id,
                    member.role?.name ?? null,
                    disabledByMutation
                  )

                  const initial = member.fullName.charAt(0).toUpperCase()

                  return (
                    <tr key={member.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              background: 'hsla(160, 87%, 30%, 0.12)',
                              color: 'var(--primary-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.9rem',
                              flexShrink: 0,
                            }}
                          >
                            {initial}
                          </div>
                          <div>
                            <strong style={{ display: 'block', color: 'var(--text-primary)' }}>
                              {member.fullName}
                            </strong>
                            {disabledSelf && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  color: 'var(--primary-color)',
                                  fontWeight: 600,
                                }}
                              >
                                (Tu cuenta actual)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '16px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            display: 'inline-block',
                            ...getRoleBadgeStyle(member.role?.name),
                          }}
                        >
                          {member.role?.displayName ?? 'Sin rol asignado'}
                        </span>
                      </td>
                      <td>
                        {member.branch ? (
                          <div style={{ fontSize: '0.88rem' }}>
                            <strong>{member.branch.name}</strong>{' '}
                            <small style={{ color: 'var(--text-secondary)' }}>({member.branch.code})</small>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                            Sin sucursal
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '16px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: member.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: member.isActive ? '#10b981' : '#ef4444',
                            display: 'inline-block',
                          }}
                        >
                          {member.isActive ? '🟢 Activo' : '🔴 Inactivo'}
                        </span>
                      </td>
                      {(canManageUsers || canAssignRoles) && (
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {canManageUsers && (
                              <button
                                type="button"
                                className="mini-action-btn"
                                onClick={() => handleBranchOpen(member)}
                                disabled={isAssignDisabled}
                                title={
                                  disabledByHierarchy
                                    ? 'La jerarquía ADMIN/OWNER protege a este usuario'
                                    : disabledSelf
                                    ? 'No puedes reasignar tu propia sucursal'
                                    : disabledByMutation
                                    ? 'Operación en curso para este usuario'
                                    : inactiveAssignCheck.disabled
                                    ? inactiveAssignCheck.reason ?? ''
                                    : 'Asignar sucursal'
                                }
                              >
                                🏬 Sucursal
                              </button>
                            )}
                            {canAssignRoles && (
                              <button
                                type="button"
                                className="mini-action-btn primary"
                                onClick={() => handleRoleOpen(member)}
                                disabled={isAssignDisabled}
                                title={
                                  disabledByHierarchy
                                    ? 'La jerarquía ADMIN/OWNER protege a este usuario'
                                    : disabledSelf
                                    ? 'No puedes cambiar tu propio rol'
                                    : disabledByMutation
                                    ? 'Operación en curso para este usuario'
                                    : inactiveAssignCheck.disabled
                                    ? inactiveAssignCheck.reason ?? ''
                                    : 'Asignar rol'
                                }
                              >
                                🏷️ Rol
                              </button>
                            )}
                            {canManageUsers && (
                              <button
                                type="button"
                                className="mini-action-btn"
                                style={{
                                  borderColor: member.isActive ? 'rgba(239, 68, 68, 0.4)' : '#10b981',
                                  color: member.isActive ? '#ef4444' : '#10b981',
                                }}
                                onClick={() => handleToggleActiveOpen(member)}
                                disabled={activeCheck.disabled}
                                title={
                                  activeCheck.disabled
                                    ? activeCheck.reason ?? ''
                                    : member.isActive
                                    ? 'Desactivar trabajador'
                                    : 'Activar trabajador'
                                }
                              >
                                {member.isActive ? 'Pausar' : 'Activar'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredStaff.length === 0 && directory.items.length > 0 && (
        <div className="promo-empty-card" style={{ marginTop: '1.25rem' }}>
          <div className="promo-empty-icon">🔍</div>
          <div style={{ maxWidth: '440px' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>No se encontraron trabajadores con esta búsqueda</h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Intenta con otro término o limpia los filtros para ver la lista completa.
            </p>
          </div>
          <button type="button" className="catalog-action" style={{ marginTop: '0.5rem' }} onClick={() => { setSearch(''); setFilterStatus('all') }}>
            Limpiar Filtros
          </button>
        </div>
      )}

      {directory.hasMore && (
        <button
          type="button"
          className="retry-btn-secondary admin-load-more"
          onClick={directory.loadMore}
          disabled={directory.loadingMore}
        >
          {directory.loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      )}

      {directory.error && directory.status === 'ready' && (
        <p className="admin-page-error" role="alert">{directory.error}</p>
      )}

      {/* Modal Asignar Sucursal */}
      {isBranchModalOpen && selectedStaff && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="branch-modal-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="branch-modal-title">Asignar Sucursal</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsBranchModalOpen(false)}>
                &times;
              </button>
            </div>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              Miembro: <strong>{selectedStaff.fullName}</strong>
            </p>
            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleBranchSubmit}>
              <div className="admin-form-group">
                <label htmlFor="branch-select">Sucursal Asignada</label>
                {loadingBranches ? (
                  <p>Cargando sucursales activas…</p>
                ) : (
                  <select
                    id="branch-select"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    disabled={isMutating}
                  >
                    <option value="" disabled>Selecciona una sucursal</option>
                    {branchesList.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.code} · {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsBranchModalOpen(false)}
                  disabled={isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={isMutating || loadingBranches || branchId === ''}>
                  {isMutating ? 'Guardando…' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Rol */}
      {isRoleModalOpen && selectedStaff && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="role-modal-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="role-modal-title">Asignar Rol</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsRoleModalOpen(false)}>
                &times;
              </button>
            </div>
            <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
              Miembro: <strong>{selectedStaff.fullName}</strong>
            </p>
            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleRoleSubmit}>
              <div className="admin-form-group">
                <label htmlFor="role-select">Rol Administrativo</label>
                <select
                  id="role-select"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  disabled={isMutating}
                >
                  <option value="" disabled>Selecciona un rol</option>
                  {USER_ROLES.filter(isRoleOptionAllowed).map((r) => (
                    <option value={r} key={r}>
                      {r === 'OWNER'
                        ? 'Propietario (OWNER)'
                        : r === 'ADMIN'
                        ? 'Administrador (ADMIN)'
                        : r === 'MANAGER'
                        ? 'Gerente (MANAGER)'
                        : r === 'INVENTORY'
                        ? 'Inventario (INVENTORY)'
                        : r === 'CASHIER'
                        ? 'Cajero (CASHIER)'
                        : 'Vendedor (SALES)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsRoleModalOpen(false)}
                  disabled={isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={isMutating || roleName === ''}>
                  {isMutating ? 'Guardando…' : 'Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Activar/Desactivar */}
      {isConfirmActiveOpen && confirmingStaff && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-active-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="confirm-active-title">
                {confirmingStaff.isActive ? 'Desactivar Trabajador' : 'Activar Trabajador'}
              </h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsConfirmActiveOpen(false)}
                disabled={isMutating}
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>
            <div style={{ margin: '1rem 0', fontSize: '0.95rem', lineHeight: '1.5' }}>
              <p>
                ¿Estás seguro de que deseas <strong>{confirmingStaff.isActive ? 'desactivar' : 'activar'}</strong> al trabajador <strong>{confirmingStaff.fullName}</strong>?
              </p>
              {confirmingStaff.isActive ? (
                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  Su configuración de sucursal y rol se conservará para futuras reincorporaciones, pero no podrá iniciar sesión en los módulos internos mientras esté inactivo.
                </p>
              ) : (
                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  Una vez activo, el trabajador podrá iniciar sesión y podrás reasignarle rol o sucursal si es necesario.
                </p>
              )}
            </div>
            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}
            <form onSubmit={handleToggleActiveSubmit}>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsConfirmActiveOpen(false)}
                  disabled={isMutating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`catalog-action ${confirmingStaff.isActive ? 'danger' : 'primary'}`}
                  disabled={isMutating}
                >
                  {isMutating
                    ? confirmingStaff.isActive
                      ? 'Desactivando…'
                      : 'Activando…'
                    : confirmingStaff.isActive
                    ? 'Desactivar'
                    : 'Activar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contenedor aria-live oculto para confirmación accesible */}
      <div className="sr-only" role="status" aria-live="polite">
        {ariaNotification}
      </div>
    </section>
  )
}
