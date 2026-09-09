import { useState } from 'react'
import { centsToFormattedMxn } from './purchases-parser'
import { usePurchases } from './usePurchases'
import { PurchaseDraftWizard } from './PurchaseDraftWizard'
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
    unmatchedLinesCount,
    refresh,
  } = usePurchases(active)

  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null)

  // Open existing purchase in wizard to resolve lines or confirm
  const handleOpenPurchase = (purchase: SupplierPurchaseListItem) => {
    setSelectedPurchaseId(purchase.id)
    setIsWizardOpen(true)
  }

  // Close wizard and return to dashboard
  const handleCloseWizard = () => {
    setIsWizardOpen(false)
    setSelectedPurchaseId(null)
    refresh()
  }

  if (isWizardOpen) {
    return (
      <section className="db-tab-content active" aria-labelledby="purchases-wizard-heading">
        <div className="section-header-row" style={{ marginBottom: '1rem' }}>
          <div>
            <span className="dashboard-kicker">Módulo de Inventario</span>
            <h3 id="purchases-wizard-heading">Registro de Compra de Proveedor</h3>
          </div>
          <button type="button" className="secondary-auth-btn" onClick={handleCloseWizard}>
            ✕ Salir al listado
          </button>
        </div>

        <PurchaseDraftWizard
          branch={branch}
          knownSuppliers={knownSuppliers}
          initialPurchaseId={selectedPurchaseId}
          onSupplierAdded={addSupplier}
          onCompleted={handleCloseWizard}
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
          <span className="dashboard-kicker">Recepción de Mercancía</span>
          <h3 id="purchases-heading">📦 Compras y Proveedores</h3>
          <p className="demo-copy" style={{ margin: 0 }}>
            Sucursal activa: <strong>{branch?.name || 'No asignada'}</strong> • Registro autoritativo en Supabase.
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
            onClick={() => {
              setSelectedPurchaseId(null)
              setIsWizardOpen(true)
            }}
          >
            + Registrar compra
          </button>
        </div>
      </div>

      {/* Indicadores / KPI Bar */}
      <div className="stock-kpi-bar" style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
            📝
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{pendingDraftsCount}</span>
            <span className="stock-kpi-label">Borradores pendientes</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            ✅
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{receivedCount}</span>
            <span className="stock-kpi-label">Compras recibidas</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            ⏳
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{unmatchedLinesCount}</span>
            <span className="stock-kpi-label">Renglones por relacionar</span>
          </div>
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="dashboard-filters-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, marginRight: '0.5rem' }}>Filtrar por estado:</span>
          {(['ALL', 'DRAFT', 'RECEIVED', 'CANCELLED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`mini-action-btn ${statusFilter === st ? 'primary' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'ALL' && 'Todas'}
              {st === 'DRAFT' && 'Borradores (DRAFT)'}
              {st === 'RECEIVED' && 'Recibidas (RECEIVED)'}
              {st === 'CANCELLED' && 'Canceladas (CANCELLED)'}
            </button>
          ))}
        </div>
      </div>

      {/* Estado: Backend Unavailable (Migraciones pendientes) */}
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

      {/* Estado: Error general */}
      {error && !isBackendUnavailable && (
        <div className="cashier-status-container error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <p className="error-copy">{error}</p>
          <button type="button" className="retry-btn-primary" onClick={refresh}>
            Reintentar
          </button>
        </div>
      )}

      {/* Estado: Carga */}
      {isLoading && (
        <div className="cashier-status-container" role="status">
          <div className="loading-spinner" />
          <p>Consultando documentos de compras autoritativos de Supabase...</p>
        </div>
      )}

      {/* Estado: Contenido / Lista de compras */}
      {!isLoading && !error && (
        <div className="botanical-section-card">
          <div className="botanical-section-header">
            <span>📑</span>
            <h4>Historial de Compras de la Sucursal</h4>
          </div>

          {purchases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1.1rem', margin: 0 }}>No hay documentos de compra registrados con este filtro.</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.4rem' }}>
                Haz clic en "+ Registrar compra" para capturar facturas o notas de proveedores.
              </p>
              <button
                type="button"
                className="submit-db-btn"
                style={{ marginTop: '1rem' }}
                onClick={() => {
                  setSelectedPurchaseId(null)
                  setIsWizardOpen(true)
                }}
              >
                + Registrar primera compra
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Fecha</th>
                    <th>Referencia / Folio</th>
                    <th>Condiciones</th>
                    <th>Total</th>
                    <th>Partidas</th>
                    <th>Pendientes</th>
                    <th>Estado</th>
                    <th style={{ width: '120px' }}>Acciones</th>
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
                          {p.paymentTerms === 'CASH' && 'Contado'}
                          {p.paymentTerms === 'CREDIT' && 'Crédito'}
                          {p.paymentTerms === 'OTHER' && 'Otro'}
                        </td>
                        <td>
                          <strong>{centsToFormattedMxn(p.expectedTotalCents)}</strong>
                        </td>
                        <td>{p.itemCount}</td>
                        <td>
                          {p.unmatchedCount > 0 ? (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>
                              {p.unmatchedCount} por resolver
                            </span>
                          ) : (
                            <span style={{ color: '#10b981' }}>Todos resueltos</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge-res ${p.status.toLowerCase()}`}
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: isReceived
                                ? 'rgba(16, 185, 129, 0.15)'
                                : isDraft
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(100, 116, 139, 0.15)',
                              color: isReceived ? '#10b981' : isDraft ? '#d97706' : '#64748b',
                            }}
                          >
                            {isDraft && 'Borrador'}
                            {isReceived && 'Recibido'}
                            {p.status === 'CANCELLED' && 'Cancelado'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="mini-action-btn primary"
                            onClick={() => handleOpenPurchase(p)}
                          >
                            {isDraft ? 'Gestionar' : 'Ver detalle'}
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
