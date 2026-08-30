import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { hasCapability } from '../access/access-helpers'
import { useAdminCustomers } from './useAdminCustomers'
import type { AdminCustomer } from './admin-customers-types'

function Feedback({
  status,
  error,
  retry,
}: {
  status: 'initial' | 'loading' | 'ready' | 'error'
  error: string | null
  retry: () => void
}) {
  if (status === 'initial') {
    return (
      <p className="no-records-copy" style={{ color: 'var(--text-secondary)' }}>
        Escribe al menos 2 caracteres en el buscador para consultar el directorio de clientes.
      </p>
    )
  }
  if (status === 'loading') {
    return (
      <div className="cashier-status-container" role="status">
        <div className="loading-spinner" />
        <p>Buscando clientes activos en la base de datos...</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="admin-directory-error" role="alert">
        <p className="error-copy">{error}</p>
        <button type="button" className="retry-btn-secondary" onClick={retry}>
          Reintentar búsqueda
        </button>
      </div>
    )
  }
  return null
}

export function AdminCustomers({ active }: { active: boolean }) {
  const { accessContext } = useAuth()
  const canManageUsers = hasCapability(accessContext, 'MANAGE_USERS')

  const customers = useAdminCustomers(active)

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleCreateOpen = () => {
    setEditingCustomer(null)
    setFullName('')
    setEmail('')
    setPhone('')
    setModalError(null)
    setSuccessMessage(null)
    setIsModalOpen(true)
  }

  const handleEditOpen = (customer: AdminCustomer) => {
    setEditingCustomer(customer)
    setFullName(customer.fullName)
    setEmail(customer.email || '')
    setPhone(customer.phone || '')
    setModalError(null)
    setSuccessMessage(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null)
    setSuccessMessage(null)

    if (!fullName.trim() || fullName.trim().length < 2 || fullName.trim().length > 160) {
      setModalError('El nombre completo debe tener entre 2 y 160 caracteres.')
      return
    }

    try {
      if (editingCustomer) {
        await customers.editCustomer(
          editingCustomer.id,
          fullName.trim(),
          email.trim() || null,
          phone.trim() || null
        )
        setSuccessMessage('Cliente actualizado correctamente.')
      } else {
        await customers.createCustomer(
          fullName.trim(),
          email.trim() || null,
          phone.trim() || null
        )
        setSuccessMessage('Cliente registrado correctamente.')
      }

      // Close modal after brief delay to show success feedback
      setTimeout(() => {
        setIsModalOpen(false)
        setSuccessMessage(null)
      }, 1000)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al guardar el cliente.')
    }
  }

  if (!canManageUsers) {
    return (
      <div className="admin-directory-error" role="alert">
        <p>No tienes la capacidad MANAGE_USERS requerida para acceder al módulo de clientes.</p>
      </div>
    )
  }

  return (
    <section className="db-tab-content active" aria-busy={customers.status === 'loading' || customers.isMutating}>
      <div className="section-header-row">
        <div>
          <h3>Administración de Clientes</h3>
          <p className="real-data-copy">Directorio real en Supabase. Operaciones administrativas protegidas.</p>
        </div>
        <button type="button" className="catalog-action" onClick={handleCreateOpen}>
          + Registrar Cliente
        </button>
      </div>

      {/* Info Notice about contract */}
      <div className="dashboard-filters-card" style={{ marginBottom: '1.5rem', backgroundColor: 'var(--surface-variant)', color: 'var(--text-secondary)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
        📢 <strong>Nota de búsqueda:</strong> El contrato de backend actual requiere una búsqueda por coincidencia (nombre, correo o teléfono) de al menos 2 caracteres y no provee un listado completo por razones de optimización y seguridad. Solo se muestran clientes activos.
      </div>

      {/* Search Filter Card */}
      <div className="dashboard-filters-card">
        <div className="filters-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="form-group">
            <label htmlFor="customer-search-input">Buscar cliente (mínimo 2 caracteres)</label>
            <input
              id="customer-search-input"
              type="text"
              placeholder="Buscar por nombre, correo electrónico o número de teléfono..."
              value={customers.query}
              onChange={(e) => customers.setQuery(e.target.value)}
              disabled={customers.status === 'loading'}
            />
          </div>
        </div>
      </div>

      <Feedback status={customers.status} error={customers.error} retry={customers.retry} />

      {customers.status === 'ready' && customers.results.length === 0 && (
        <p className="no-records-copy" role="status">No se encontraron clientes activos que coincidan con la búsqueda.</p>
      )}

      {customers.status === 'ready' && customers.results.length > 0 && (
        <div className="table-responsive">
          <table className="db-table">
            <thead>
              <tr>
                <th>Nombre Completo</th>
                <th>Correo Electrónico</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.results.map((customer) => (
                <tr key={customer.id}>
                  <td style={{ fontWeight: 'bold' }}>{customer.fullName}</td>
                  <td>{customer.email || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                  <td>{customer.phone || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                  <td>
                    <div className="admin-actions-cell">
                      <button
                        type="button"
                        className="admin-action-btn secondary"
                        onClick={() => handleEditOpen(customer)}
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create/Edit Customer */}
      {isModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
          <div className="admin-modal-content">
            <div className="admin-modal-header">
              <h3 id="customer-modal-title">
                {editingCustomer ? 'Editar Cliente' : 'Registrar Cliente'}
              </h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsModalOpen(false)}
                disabled={customers.isMutating}
              >
                &times;
              </button>
            </div>

            {modalError && <div className="admin-dialog-error" role="alert">{modalError}</div>}
            {successMessage && (
              <div className="admin-dialog-success" role="status" aria-live="polite" style={{ backgroundColor: 'var(--success-surface)', color: 'var(--success)', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                🟢 {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="admin-form-group">
                <label htmlFor="c-fullname">Nombre Completo *</label>
                <input
                  id="c-fullname"
                  type="text"
                  required
                  maxLength={160}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  disabled={customers.isMutating || successMessage !== null}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="c-email">Correo Electrónico</label>
                <input
                  id="c-email"
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej. juan@example.com (Opcional)"
                  disabled={customers.isMutating || successMessage !== null}
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="c-phone">Teléfono</label>
                <input
                  id="c-phone"
                  type="text"
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. 5512345678 (Opcional)"
                  disabled={customers.isMutating || successMessage !== null}
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={customers.isMutating || successMessage !== null}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="catalog-action"
                  disabled={customers.isMutating || successMessage !== null}
                >
                  {customers.isMutating ? 'Guardando…' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
