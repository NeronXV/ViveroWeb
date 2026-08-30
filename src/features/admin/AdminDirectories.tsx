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

  return (
    <section className="db-tab-content active" aria-busy={directory.status === 'loading' || directory.loadingMore}>
      <div className="section-header-row">
        <div>
          <h3>Sucursales</h3>
          <p className="real-data-copy">Directorio real de Supabase. Operaciones administrativas protegidas.</p>
        </div>
        {canManageBranches && (
          <button type="button" className="catalog-action" onClick={handleCreateOpen}>
            + Crear Sucursal
          </button>
        )}
      </div>

      <Feedback status={directory.status} error={directory.error} retry={directory.retry} />

      {directory.status === 'ready' && directory.items.length === 0 && (
        <p role="status">No hay sucursales disponibles.</p>
      )}

      {directory.items.length > 0 && (
        <div className="table-responsive">
          <table className="db-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Personal activo</th>
                <th>Ventas pendientes</th>
                <th>Estado</th>
                {canManageBranches && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {directory.items.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.code}</td>
                  <td>{branch.name}</td>
                  <td>{branch.activeStaffCount}</td>
                  <td>{branch.pendingSaleCount}</td>
                  <td>{branch.isActive ? '🟢 Activa' : '🔴 Inactiva'}</td>
                  {canManageBranches && (
                    <td>
                      <div className="admin-actions-cell">
                        <button
                          type="button"
                          className="admin-action-btn secondary"
                          onClick={() => handleEditOpen(branch)}
                          title="Editar sucursal"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`admin-action-btn ${branch.isActive ? 'danger' : 'primary'}`}
                          onClick={() => handleToggleActive(branch)}
                        >
                          {branch.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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

  // Comprobar la jerarquía de roles (ADMIN no puede modificar ADMIN ni OWNER)
  const isProtectedByHierarchy = (member: AdminStaffMember): boolean => {
    const callerRole = accessContext?.role?.name
    if (callerRole === 'ADMIN') {
      return member.role?.name === 'ADMIN' || member.role?.name === 'OWNER'
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
      return role !== 'ADMIN' && role !== 'OWNER'
    }
    return true
  }

  return (
    <section className="db-tab-content active" aria-busy={directory.status === 'loading' || directory.loadingMore}>
      <h3>Personal y roles</h3>
      <p className="real-data-copy">Directorio real de Supabase. Acciones protegidas por jerarquía.</p>

      <Feedback status={directory.status} error={directory.error} retry={directory.retry} />

      {directory.status === 'ready' && directory.items.length === 0 && (
        <p role="status">No hay personal disponible.</p>
      )}

      {directory.items.length > 0 && (
        <div className="table-responsive">
          <table className="db-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Sucursal</th>
                <th>Estado</th>
                {(canManageUsers || canAssignRoles) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {directory.items.map((member) => {
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

                return (
                  <tr key={member.id}>
                    <td>{member.fullName} {disabledSelf && <span className="role-badge-db admin" style={{ display: 'inline', fontSize: '0.7rem', padding: '0.1rem 0.3rem' }}>Tú</span>}</td>
                    <td>{member.role?.displayName ?? 'Sin rol'}</td>
                    <td>{member.branch ? `${member.branch.code} · ${member.branch.name}` : 'Sin sucursal'}</td>
                    <td>{member.isActive ? '🟢 Activo' : '🔴 Inactivo'}</td>
                    {(canManageUsers || canAssignRoles) && (
                      <td>
                        <div className="admin-actions-cell">
                          {canManageUsers && (
                            <button
                              type="button"
                              className="admin-action-btn secondary"
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
                              Sucursal
                            </button>
                          )}
                          {canAssignRoles && (
                            <button
                              type="button"
                              className="admin-action-btn secondary"
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
                              Rol
                            </button>
                          )}
                          {canManageUsers && (
                            <button
                              type="button"
                              className={`admin-action-btn ${member.isActive ? 'danger' : 'primary'}`}
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
                              {member.isActive ? 'Desactivar' : 'Activar'}
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
