import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { useAuth } from '../auth/useAuth'
import { DemoBanner } from '../../components/feedback/DemoBanner'
import { useCashierSales } from './useCashierSales'
import { useCashierSaleDetail } from './useCashierSaleDetail'

export function CashierPage() {
  useDocumentTitle('Caja')
  const headingRef = useHeadingFocus<HTMLHeadingElement>('cashier')
  const { accessContext } = useAuth()

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string>('')

  const {
    sales,
    isLoading: isSalesLoading,
    isUpdating: isSalesUpdating,
    isLoadingMore,
    isError: isSalesError,
    errorMsg: salesErrorMsg,
    hasMore,
    refresh: refreshSales,
    loadMore,
  } = useCashierSales(15)

  const {
    saleDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    errorMsg: detailErrorMsg,
    errorCode: detailErrorCode,
    retry: retryDetail,
    clearDetail,
  } = useCashierSaleDetail(selectedSaleId)

  const handleSelectSale = (saleId: string) => {
    setSelectedSaleId(saleId)
    setNotice('')
  }

  const handleCloseDetail = () => {
    setSelectedSaleId(null)
    clearDetail()
    setNotice('')
  }

  const handleSimulatePayment = () => {
    if (!saleDetail) return
    const folio = saleDetail.sale.folio
    setNotice(
      `Simulación: Venta real ${folio} cobrada localmente. El registro definitivo del cobro real en el backend estará disponible en la siguiente fase.`,
    )
  }

  const cashierName = accessContext?.profile?.fullName ?? 'Cajero/a'
  const branchName = accessContext?.branch?.name ?? 'Sucursal'

  return (
    <main className="internal-page">
      <div className="internal-shell">
        <div className="internal-topbar">
          <div>
            <p className="eyebrow">Vivero Dulcinea</p>
            <h1 ref={headingRef} tabIndex={-1}>
              Caja Web Real
            </h1>
            <p className="cashier-info-subtitle">
              Operador: <strong>{cashierName}</strong> · Sucursal: <strong>{branchName}</strong>
            </p>
          </div>
          <div>
            <DemoBanner compact />
            <Link className="back-link" to="/">
              Salir
            </Link>
          </div>
        </div>

        <div className="cashier-layout">
          {/* Columna Izquierda: Bandeja de Ventas Pendientes */}
          <section className="cashier-products" aria-labelledby="queue-title">
            <div className="section-header-row">
              <h2 id="queue-title">Fila de Espera de Caja</h2>
              <button
                type="button"
                className="refresh-btn-secondary"
                onClick={refreshSales}
                disabled={isSalesLoading || isSalesUpdating}
                aria-label="Actualizar fila de ventas"
              >
                {isSalesUpdating ? 'Actualizando...' : '↻ Actualizar'}
              </button>
            </div>

            {/* Estado de carga inicial */}
            {isSalesLoading && sales.length === 0 && (
              <div className="cashier-status-container" role="status" aria-live="polite">
                <div className="loading-spinner" />
                <p>Cargando fila de ventas pendientes...</p>
              </div>
            )}

            {/* Estado de error de la fila */}
            {isSalesError && sales.length === 0 && (
              <div className="cashier-status-container error" role="alert">
                <p className="error-copy">{salesErrorMsg}</p>
                <button type="button" className="retry-btn-primary" onClick={refreshSales}>
                  Reintentar cargar fila
                </button>
              </div>
            )}

            {/* Fila vacía */}
            {!isSalesLoading && !isSalesError && sales.length === 0 && (
              <div className="cashier-status-container empty">
                <p className="empty-copy">No hay ventas pendientes por cobrar en esta sucursal.</p>
                <button type="button" className="retry-btn-secondary" onClick={refreshSales}>
                  Buscar nuevas ventas
                </button>
              </div>
            )}

            {/* Lista de ventas pendientes */}
            {sales.length > 0 && (
              <div className="cashier-sales-list">
                {isSalesUpdating && (
                  <div className="updating-toast" role="status">
                    Actualizando fila en segundo plano...
                  </div>
                )}

                <div className="sales-grid">
                  {sales.map((sale) => {
                    const isSelected = sale.id === selectedSaleId
                    const dateObj = new Date(sale.createdAt)
                    const formattedDate = dateObj.toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })

                    // Determinar badge del claimState
                    let claimBadgeClass = 'claim-badge available'
                    let claimLabel = 'Disponible'
                    if (sale.claimState === 'CLAIMED_BY_ME') {
                      claimBadgeClass = 'claim-badge claimed-me'
                      claimLabel = 'Mi Turno'
                    } else if (sale.claimState === 'CLAIMED_BY_OTHER') {
                      claimBadgeClass = 'claim-badge claimed-other'
                      claimLabel = 'En Cobro (Otro)'
                    }

                    return (
                      <article
                        key={sale.id}
                        className={`sale-card-item ${isSelected ? 'selected' : ''} ${
                          sale.claimState === 'CLAIMED_BY_OTHER' ? 'claimed-by-other' : ''
                        }`}
                        onClick={() => handleSelectSale(sale.id)}
                      >
                        <div className="sale-card-header">
                          <span className="sale-folio">{sale.folio}</span>
                          <span className="sale-time">{formattedDate}</span>
                        </div>
                        <div className="sale-card-body">
                          <p className="sale-total-amount">${(sale.totalCents / 100).toFixed(2)} MXN</p>
                          <p className="sale-meta-info">
                            {sale.itemCount} {sale.itemCount === 1 ? 'artículo' : 'artículos'}
                          </p>
                          {sale.createdByLabel && (
                            <p className="sale-creator-label">Vendedor: {sale.createdByLabel}</p>
                          )}
                        </div>
                        <div className="sale-card-footer">
                          <span className={claimBadgeClass}>{claimLabel}</span>
                          {sale.claimState === 'CLAIMED_BY_OTHER' && (
                            <span className="claim-disabled-msg">Ocupada</span>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>

                {hasMore && (
                  <button
                    type="button"
                    className="load-more-btn"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? 'Cargando más...' : 'Cargar más ventas'}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Columna Derecha: Detalle de la Venta (Ticket) */}
          <aside className="cashier-ticket" aria-labelledby="ticket-title">
            <h2 id="ticket-title">Ticket de Cobro</h2>

            {/* Sin selección */}
            {!selectedSaleId && (
              <div className="ticket-placeholder">
                <p>Selecciona una venta de la fila de espera para procesar su cobro.</p>
              </div>
            )}

            {/* Cargando detalle */}
            {selectedSaleId && isDetailLoading && (
              <div className="ticket-placeholder loading">
                <div className="loading-spinner" />
                <p>Cargando detalle del ticket...</p>
              </div>
            )}

            {/* Error cargando detalle */}
            {selectedSaleId && isDetailError && (
              <div className="ticket-placeholder error" role="alert">
                <p className="error-title">Error al cargar detalle</p>
                <p className="error-copy">{detailErrorMsg}</p>
                {detailErrorCode === 'SALE_UNAVAILABLE' ? (
                  <button type="button" className="retry-btn-secondary" onClick={handleCloseDetail}>
                    Volver a la fila
                  </button>
                ) : (
                  <div className="error-action-row">
                    <button type="button" className="retry-btn-primary" onClick={retryDetail}>
                      Reintentar
                    </button>
                    <button type="button" className="retry-btn-secondary" onClick={handleCloseDetail}>
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Detalle del Ticket cargado */}
            {selectedSaleId && saleDetail && (
              <div className="ticket-detail-content">
                <div className="ticket-header-meta">
                  <div className="folio-row">
                    <h3>Folio: {saleDetail.sale.folio}</h3>
                    <button type="button" className="close-ticket-btn" onClick={handleCloseDetail} aria-label="Cerrar ticket">
                      ✕
                    </button>
                  </div>
                  <p>Creado: {new Date(saleDetail.sale.createdAt).toLocaleString('es-MX')}</p>
                  {saleDetail.sale.createdByLabel && (
                    <p>Vendedor: {saleDetail.sale.createdByLabel}</p>
                  )}
                  <div className="ticket-status-label-row">
                    <span>Estado: Real DB</span>
                    <span
                      className={`claim-text-indicator ${saleDetail.sale.claimState.toLowerCase()}`}
                    >
                      {saleDetail.sale.claimState === 'CLAIMED_BY_ME'
                        ? 'Mi turno de cobro'
                        : saleDetail.sale.claimState === 'CLAIMED_BY_OTHER'
                        ? 'En cobro por otro cajero'
                        : 'Disponible para cobrar'}
                    </span>
                  </div>
                </div>

                <div className="ticket-divider" />

                <div className="ticket-items-list">
                  {saleDetail.items.map((item, index) => (
                    <div className="ticket-item-row" key={`${item.id}-${index}`}>
                      <div className="ticket-item-name-col">
                        <span className="item-name">{item.productName}</span>
                        <span className="item-price-desc">
                          {item.quantity} × ${(item.unitPriceCents / 100).toFixed(2)}
                        </span>
                      </div>
                      <span className="item-total-price">
                        ${(item.lineTotalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ticket-divider" />

                <div className="ticket-total">
                  <span>Total</span>
                  <strong>${(saleDetail.sale.totalCents / 100).toFixed(2)} MXN</strong>
                </div>

                <div className="demo-notice-box">
                  <p>
                    <strong>Nota de Integración:</strong> Esta venta proviene de la base de datos real
                    de Supabase, pero la confirmación y almacenamiento del cobro y stock real están
                    deshabilitadas en esta fase.
                  </p>
                </div>

                <button
                  className="checkout-btn"
                  onClick={handleSimulatePayment}
                  disabled={saleDetail.sale.claimState === 'CLAIMED_BY_OTHER'}
                >
                  Pagar (Simulación Demo)
                </button>

                {notice && (
                  <p className="form-notice active" aria-live="polite">
                    {notice}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
