import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { centsToFormattedMxn } from './purchases-parser'
import { usePurchases } from './usePurchases'
import { ReceptionWizard } from './ReceptionWizard'
import type { SupplierPurchaseListItem } from './purchases-types'

interface PurchasesDashboardProps {
  active: boolean
  branch: { id: string; name: string } | null
  onNavigateToCatalog?: () => void
}

export function PurchasesDashboard({
  active,
  branch,
  onNavigateToCatalog,
}: PurchasesDashboardProps) {
  const {
    purchases,
    statusFilter,
    setStatusFilter,
    isLoading,
    error,
    isBackendUnavailable,
    knownSuppliers,
    addSupplier,
    pendingDraftsCount,
    receivedCount,
    refresh,
  } = usePurchases(active)

  const [searchParams, setSearchParams] = useSearchParams()
  const [localWizardOpen, setLocalWizardOpen] = useState(false)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null)

  const isWizardOpen = searchParams.get('reception') === '1' || localWizardOpen

  // Open existing purchase in wizard to resolve lines or confirm
  const handleOpenPurchase = (purchase: SupplierPurchaseListItem) => {
    setSelectedPurchaseId(purchase.id)
    setLocalWizardOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('reception', '1')
    setSearchParams(next)
  }

  // Open wizard for new reception / quotation
  const handleOpenNewWizard = () => {
    setSelectedPurchaseId(null)
    setLocalWizardOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('reception', '1')
    setSearchParams(next)
  }

  // Close wizard and return to dashboard
  const handleCloseWizard = () => {
    setLocalWizardOpen(false)
    setSelectedPurchaseId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('reception')
    setSearchParams(next)
    refresh()
  }

  if (isWizardOpen) {
    return (
      <section className="db-tab-content active" aria-labelledby="purchases-wizard-heading">
        <div className="section-header-row" style={{ marginBottom: '1.25rem' }}>
          <div>
            <span className="dashboard-kicker">Recepción y Compras</span>
            <h3 id="purchases-wizard-heading" style={{ fontSize: '1.4rem', color: 'var(--primary-color)', margin: 0 }}>
              {selectedPurchaseId ? 'Revisión y Recepción de Mercancía' : 'Nueva Recepción / Cotización'}
            </h3>
            <p className="demo-copy" style={{ margin: '4px 0 0' }}>
              Sucursal activa: <strong>{branch?.name || 'No asignada'}</strong>
            </p>
          </div>
        </div>

        <ReceptionWizard
          key={branch?.id}
          branch={branch}
          knownSuppliers={knownSuppliers}
          initialPurchaseId={selectedPurchaseId}
          onSupplierAdded={addSupplier}
          onCompleted={refresh}
          onNavigateToCatalog={onNavigateToCatalog}
          onCancel={handleCloseWizard}
        />
      </section>
    )
  }

  return (
    <section className="db-tab-content active" aria-labelledby="purchases-heading">
      <div className="section-header-row">
        <div>
          <span className="dashboard-kicker">Operación de Inventario</span>
          <h3 id="purchases-heading">📦 Recepción, Compras y Proveedores</h3>
          <p className="demo-copy" style={{ margin: 0 }}>
            Sucursal activa: <strong>{branch?.name || 'No asignada'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="refresh-btn-secondary"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Actualizar compras"
          >
            {isLoading ? 'Cargando...' : '↻ Actualizar'}
          </button>
          <button
            type="button"
            className="submit-db-btn"
            onClick={handleOpenNewWizard}
          >
            + Nueva Recepción / Cotización
          </button>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="stock-kpi-bar" style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
        <div
          className="stock-kpi-card"
          style={{ cursor: 'pointer', border: statusFilter === 'DRAFT' ? '2px solid #0288d1' : undefined }}
          onClick={() => setStatusFilter(statusFilter === 'DRAFT' ? 'ALL' : 'DRAFT')}
        >
          <div className="stock-kpi-icon" style={{ background: 'rgba(2, 136, 209, 0.15)', color: '#0288d1' }}>
            💾
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{pendingDraftsCount}</span>
            <span className="stock-kpi-label">Cotizaciones por recibir</span>
          </div>
        </div>

        <div
          className="stock-kpi-card"
          style={{ cursor: 'pointer', border: statusFilter === 'RECEIVED' ? '2px solid #10b981' : undefined }}
          onClick={() => setStatusFilter(statusFilter === 'RECEIVED' ? 'ALL' : 'RECEIVED')}
        >
          <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            ✅
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{receivedCount}</span>
            <span className="stock-kpi-label">Recepciones completadas</span>
          </div>
        </div>

        <div
          className="stock-kpi-card"
          style={{ cursor: 'pointer', border: statusFilter === 'ALL' ? '2px solid var(--primary-color)' : undefined }}
          onClick={() => setStatusFilter('ALL')}
        >
          <div className="stock-kpi-icon" style={{ background: 'var(--surface-subtle, rgba(32, 78, 64, 0.15))', color: 'var(--primary-color)' }}>
            📑
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{purchases.length}</span>
            <span className="stock-kpi-label">Total de documentos</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="dashboard-filters-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 650, marginRight: '0.5rem', color: 'var(--primary-color)' }}>
            Vista:
          </span>
          <button
            type="button"
            className={`mini-action-btn ${statusFilter === 'ALL' ? 'primary' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Todos ({purchases.length})
          </button>
          <button
            type="button"
            className={`mini-action-btn ${statusFilter === 'DRAFT' ? 'primary' : ''}`}
            onClick={() => setStatusFilter('DRAFT')}
          >
            💾 Cotizaciones pendientes ({pendingDraftsCount})
          </button>
          <button
            type="button"
            className={`mini-action-btn ${statusFilter === 'RECEIVED' ? 'primary' : ''}`}
            onClick={() => setStatusFilter('RECEIVED')}
          >
            ✅ Mercancía recibida ({receivedCount})
          </button>
        </div>
      </div>

      {/* Backend Unavailable */}
      {isBackendUnavailable && (
        <div className="admin-directory-error" role="alert" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
          <p className="error-copy" style={{ fontSize: '1rem', fontWeight: 600 }}>
            El backend de Compras y proveedores todavía no está disponible en este entorno. Aplica las migraciones autoritativas de ViveroApp y vuelve a intentar.
          </p>
          <button type="button" className="retry-btn-secondary" onClick={refresh} style={{ marginTop: '0.75rem' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* General Error */}
      {error && !isBackendUnavailable && (
        <div className="cashier-status-container error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <p className="error-copy">{error}</p>
          <button type="button" className="retry-btn-primary" onClick={refresh}>
            Reintentar
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="cashier-status-container" role="status">
          <div className="loading-spinner" />
          <p>Consultando documentos de compras y proveedores...</p>
        </div>
      )}

      {/* Table / List */}
      {!isLoading && !error && (
        <div className="botanical-section-card">
          <div className="botanical-section-header">
            <span>📑</span>
            <h4>
              {statusFilter === 'DRAFT'
                ? 'Cotizaciones Pendientes de Recepción'
                : statusFilter === 'RECEIVED'
                  ? 'Historial de Mercancía Recibida'
                  : 'Documentos de Compra y Proveedores'}
            </h4>
          </div>

          {purchases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1.1rem', margin: 0 }}>No hay documentos registrados con este filtro.</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.4rem' }}>
                Haz clic en "+ Nueva Recepción / Cotización" para cargar una lista de proveedor.
              </p>
              <button
                type="button"
                className="submit-db-btn"
                style={{ marginTop: '1rem' }}
                onClick={handleOpenNewWizard}
              >
                + Cargar primera lista
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Fecha</th>
                    <th>Folio / Referencia</th>
                    <th>Total</th>
                    <th>Partidas</th>
                    <th>Estado</th>
                    <th style={{ width: '160px' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => {
                    const isDraft = p.status === 'DRAFT'
                    const isReceived = p.status === 'RECEIVED'
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.supplier.name}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Cód: {p.supplier.code}
                          </span>
                        </td>
                        <td>{p.documentDate}</td>
                        <td>
                          {p.externalReference ? (
                            <code>{p.externalReference}</code>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>(Sin ref.)</span>
                          )}
                        </td>
                        <td>
                          <strong>{centsToFormattedMxn(p.expectedTotalCents)}</strong>
                        </td>
                        <td>
                          {p.itemCount} variedades
                          {p.unmatchedCount > 0 && isDraft && (
                            <span style={{ display: 'block', fontSize: '0.72rem', color: '#f57f17' }}>
                              ({p.unmatchedCount} por definir)
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge-res ${p.status.toLowerCase()}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '100px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: isReceived
                                ? '#e8f5e9'
                                : isDraft
                                  ? '#e1f5fe'
                                  : '#f1f5f9',
                              color: isReceived ? '#2e7d32' : isDraft ? '#0277bd' : '#475569',
                              border: isReceived
                                ? '1px solid #a5d6a7'
                                : isDraft
                                  ? '1px solid #81d4fa'
                                  : '1px solid #cbd5e1',
                            }}
                          >
                            {isDraft && '💾 Cotización'}
                            {isReceived && '✅ Recibido'}
                            {p.status === 'CANCELLED' && 'Cancelado'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`mini-action-btn ${isDraft ? 'primary' : ''}`}
                            onClick={() => handleOpenPurchase(p)}
                            style={{
                              minHeight: 36,
                              padding: '6px 12px',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                            }}
                          >
                            {isDraft ? '📦 Recibir mercancía' : 'Ver detalle'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
