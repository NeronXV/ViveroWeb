import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { useAuth } from '../auth/useAuth'
import { DemoBanner } from '../../components/feedback/DemoBanner'
import { useCashierSales } from './useCashierSales'
import { useCashierSaleDetail } from './useCashierSaleDetail'
import { useCashierPaymentAttempt } from './useCashierPaymentAttempt'
import type { CashierPaymentMethod } from './cashier-types'

export function CashierPage() {
  useDocumentTitle('Caja')
  const headingRef = useHeadingFocus<HTMLHeadingElement>('cashier')
  const { accessContext } = useAuth()
  const userId = accessContext?.userId ?? null

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  // 1. Obtener la fila de ventas pendientes de Supabase
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

  // 2. Obtener el detalle de la venta seleccionada
  const {
    saleDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    errorMsg: detailErrorMsg,
    errorCode: detailErrorCode,
    retry: retryDetail,
    clearDetail,
  } = useCashierSaleDetail(selectedSaleId)

  // 3. Orquestar el flujo de intento de pago idempotente para la venta activa
  const {
    attempt,
    actionInProgress,
    claimSale,
    releaseClaim,
    confirmPayment,
    reconcilePayment,
    resetAttempt,
  } = useCashierPaymentAttempt(userId, saleDetail?.sale ?? null)

  // Estados locales para el formulario de pago
  const [paymentMethod, setPaymentMethod] = useState<CashierPaymentMethod>('CASH')
  const [cashReceivedText, setCashReceivedText] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Limpiar formulario al cambiar de venta o de método de pago
  useEffect(() => {
    setCashReceivedText('')
    setReferenceText('')
    setFormError(null)
  }, [selectedSaleId, paymentMethod])

  const handleSelectSale = async (saleId: string) => {
    // Si ya teníamos una venta seleccionada y reclamada por nosotros, la liberamos antes de cambiar
    if (attempt && attempt.status === 'CLAIMED' && attempt.claimToken) {
      await releaseClaim()
    }
    setSelectedSaleId(saleId)
  }

  const handleCloseDetail = async () => {
    if (attempt && attempt.status === 'CLAIMED' && attempt.claimToken) {
      await releaseClaim()
    }
    setSelectedSaleId(null)
    clearDetail()
  }

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!saleDetail || !attempt || !attempt.claimToken || actionInProgress) return
    setFormError(null)

    const totalCents = saleDetail.sale.totalCents
    let amountReceivedCents: number | null = null
    let finalReference: string | null = null

    if (paymentMethod === 'CASH') {
      const parsedReceived = parseFloat(cashReceivedText)
      if (isNaN(parsedReceived) || parsedReceived <= 0) {
        setFormError('Por favor, ingresa una cantidad de efectivo válida.')
        return
      }
      // Conversión a centavos evitando punto flotante
      amountReceivedCents = Math.round(parsedReceived * 100)
      if (amountReceivedCents < totalCents) {
        setFormError('El efectivo recibido es insuficiente para cubrir el total.')
        return
      }
    } else if (paymentMethod === 'TRANSFER') {
      const trimmedRef = referenceText.trim()
      if (!trimmedRef) {
        setFormError('La referencia bancaria es obligatoria para transferencias.')
        return
      }
      finalReference = trimmedRef
    } else if (paymentMethod === 'CARD') {
      const trimmedRef = referenceText.trim()
      // Validar que no se guarden CVV (3-4 dígitos) o números de tarjeta (13-19 dígitos)
      if (trimmedRef) {
        if (/^[0-9]{3,4}$/.test(trimmedRef)) {
          setFormError('Por seguridad, no ingreses el código CVV en la referencia.')
          return
        }
        const digitsOnly = trimmedRef.replace(/[^0-9]/g, '')
        if (/^[0-9]{13,19}$/.test(digitsOnly)) {
          setFormError('Por seguridad, no ingreses números de tarjeta de crédito/débito en la referencia.')
          return
        }
        finalReference = trimmedRef
      }
    }

    await confirmPayment(paymentMethod, amountReceivedCents, finalReference)
    // Refrescar la bandeja al procesar exitosamente
    void refreshSales()
  }

  // Cálculos de efectivo y cambio en centavos
  const totalCents = saleDetail?.sale.totalCents ?? 0
  const cashReceivedCents = cashReceivedText ? Math.round(parseFloat(cashReceivedText) * 100) : 0
  const changeCents = cashReceivedCents >= totalCents ? cashReceivedCents - totalCents : 0

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

          {/* Columna Derecha: Detalle de la Venta (Ticket de Cobro) */}
          <aside className="cashier-ticket" aria-labelledby="ticket-title">
            <h2 id="ticket-title">Ticket de Cobro Real</h2>

            {/* Sin selección */}
            {!selectedSaleId && (
              <div className="ticket-placeholder">
                <p>Selecciona una venta de la fila de espera para procesar su cobro.</p>
              </div>
            )}

            {/* Cargando detalle de venta */}
            {selectedSaleId && isDetailLoading && (
              <div className="ticket-placeholder loading">
                <div className="loading-spinner" />
                <p>Cargando detalle del ticket...</p>
              </div>
            )}

            {/* Error al cargar detalle */}
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

            {/* Detalle del Ticket y Fases del Intento de Pago */}
            {selectedSaleId && saleDetail && attempt && (
              <div className="ticket-detail-content">
                <div className="ticket-header-meta">
                  <div className="folio-row">
                    <h3>Folio: {saleDetail.sale.folio}</h3>
                    <button
                      type="button"
                      className="close-ticket-btn"
                      onClick={handleCloseDetail}
                      disabled={attempt.status === 'CONFIRMING' || actionInProgress}
                      aria-label="Cerrar ticket"
                    >
                      ✕
                    </button>
                  </div>
                  <p>Creado: {new Date(saleDetail.sale.createdAt).toLocaleString('es-MX')}</p>
                  {saleDetail.sale.createdByLabel && (
                    <p>Vendedor: {saleDetail.sale.createdByLabel}</p>
                  )}
                </div>

                <div className="ticket-divider" />

                {/* Fase 1: Venta no reclamada (CLAIMING) */}
                {attempt.status === 'CLAIMING' && (
                  <div className="attempt-status-box info">
                    <p>Para iniciar el cobro debes reclamar esta venta primero.</p>
                    {attempt.errorMsg && <p className="error-msg-inline">{attempt.errorMsg}</p>}
                    <button
                      type="button"
                      className="checkout-btn"
                      onClick={claimSale}
                      disabled={actionInProgress || saleDetail.sale.claimState === 'CLAIMED_BY_OTHER'}
                    >
                      {actionInProgress ? 'Reclamando...' : 'Reclamar Venta'}
                    </button>
                    {saleDetail.sale.claimState === 'CLAIMED_BY_OTHER' && (
                      <p className="error-msg-inline">Esta venta está ocupada por otro cajero.</p>
                    )}
                  </div>
                )}

                {/* Fase 2: Venta reclamada (CLAIMED) o intento fallido previo (FAILED) */}
                {(attempt.status === 'CLAIMED' || attempt.status === 'FAILED') && (
                  <div className="attempt-payment-form">
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

                    {/* Formulario de Pago */}
                    <form onSubmit={handleConfirmPay} className="payment-method-form">
                      <div className="form-group">
                        <label htmlFor="payment-method-select">Método de Pago</label>
                        <select
                          id="payment-method-select"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as CashierPaymentMethod)}
                          disabled={actionInProgress}
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="CARD">Tarjeta Bancaria</option>
                          <option value="TRANSFER">Transferencia</option>
                        </select>
                      </div>

                      {paymentMethod === 'CASH' && (
                        <div className="cash-payment-fields">
                          <div className="form-group">
                            <label htmlFor="cash-received-input">Efectivo Recibido ($)</label>
                            <input
                              id="cash-received-input"
                              className="internal-input"
                              type="number"
                              step="0.01"
                              min={(saleDetail.sale.totalCents / 100).toFixed(2)}
                              value={cashReceivedText}
                              onChange={(e) => setCashReceivedText(e.target.value)}
                              placeholder="0.00"
                              required
                              disabled={actionInProgress}
                            />
                          </div>
                          {cashReceivedCents >= totalCents && (
                            <div className="change-indicator">
                              <span>Cambio a devolver:</span>
                              <strong>${(changeCents / 100).toFixed(2)} MXN</strong>
                            </div>
                          )}
                        </div>
                      )}

                      {paymentMethod === 'CARD' && (
                        <div className="form-group">
                          <label htmlFor="card-ref-input">Referencia de Operación (Opcional)</label>
                          <input
                            id="card-ref-input"
                            className="internal-input"
                            type="text"
                            value={referenceText}
                            onChange={(e) => setReferenceText(e.target.value)}
                            placeholder="Ej. Nro Autorización"
                            maxLength={120}
                            disabled={actionInProgress}
                          />
                        </div>
                      )}

                      {paymentMethod === 'TRANSFER' && (
                        <div className="form-group">
                          <label htmlFor="transfer-ref-input">Clave de Rastreo o Referencia (Obligatorio)</label>
                          <input
                            id="transfer-ref-input"
                            className="internal-input"
                            type="text"
                            value={referenceText}
                            onChange={(e) => setReferenceText(e.target.value)}
                            placeholder="Ej. Clave de rastreo SPEI"
                            required
                            maxLength={120}
                            disabled={actionInProgress}
                          />
                        </div>
                      )}

                      {formError && <p className="error-msg-inline">{formError}</p>}
                      {attempt.errorMsg && <p className="error-msg-inline">{attempt.errorMsg}</p>}

                      <div className="action-row-buttons">
                        <button
                          type="submit"
                          className="checkout-btn pay"
                          disabled={actionInProgress}
                        >
                          {actionInProgress ? 'Confirmando...' : 'Confirmar Pago'}
                        </button>
                        <button
                          type="button"
                          className="retry-btn-secondary full-width"
                          onClick={releaseClaim}
                          disabled={actionInProgress}
                        >
                          Liberar y Volver
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Fase 3: Confirmación en curso (CONFIRMING) */}
                {attempt.status === 'CONFIRMING' && (
                  <div className="attempt-status-box loading">
                    <div className="loading-spinner" />
                    <p>Enviando confirmación de cobro al servidor...</p>
                  </div>
                )}

                {/* Fase 4: Estado Incierto por caída o timeout (UNCERTAIN) */}
                {attempt.status === 'UNCERTAIN' && (
                  <div className="attempt-status-box uncertain" role="alert">
                    <h4 className="box-title">Cobro Incierto</h4>
                    <p>
                      Se perdió la comunicación con el servidor durante el registro del pago.
                      Por favor, concilia el estado antes de intentar cualquier acción para evitar duplicar cobros.
                    </p>
                    {attempt.errorMsg && <p className="error-msg-inline">{attempt.errorMsg}</p>}
                    <button
                      type="button"
                      className="checkout-btn reconcile"
                      onClick={reconcilePayment}
                      disabled={actionInProgress}
                    >
                      {actionInProgress ? 'Conciliando...' : 'Conciliar / Recuperar Pago'}
                    </button>
                  </div>
                )}

                {/* Fase 5: Cobro Exitoso confirmado (SUCCEEDED) */}
                {attempt.status === 'SUCCEEDED' && attempt.paymentResult && (
                  <div className="attempt-status-box succeeded">
                    <div className="success-icon">✓</div>
                    <h4>¡Cobro Confirmado!</h4>
                    <p className="success-copy">El pago se registró con éxito en el servidor.</p>

                    <div className="ticket-divider" />

                    <div className="succeeded-ticket-meta">
                      <p>Folio: <strong>{attempt.paymentResult.sale?.folio}</strong></p>
                      <p>Método: <strong>{attempt.paymentResult.payment?.method}</strong></p>
                      {attempt.paymentResult.payment?.method === 'CASH' && (
                        <>
                          <p>Recibido: <strong>${((attempt.paymentResult.payment?.amountReceivedCents ?? 0) / 100).toFixed(2)} MXN</strong></p>
                          <p>Cambio: <strong>${((attempt.paymentResult.payment?.changeCents ?? 0) / 100).toFixed(2)} MXN</strong></p>
                        </>
                      )}
                      {attempt.paymentResult.payment?.reference && (
                        <p>Referencia: <strong>{attempt.paymentResult.payment.reference}</strong></p>
                      )}
                      <p>Fecha pago: <strong>{new Date(attempt.paymentResult.payment?.createdAt ?? '').toLocaleTimeString('es-MX')}</strong></p>
                    </div>

                    <button type="button" className="checkout-btn" onClick={resetAttempt}>
                      Cobrar Otra Venta
                    </button>
                  </div>
                )}

                {/* Fase 6: Claim Expirado en uso (EXPIRED) */}
                {attempt.status === 'EXPIRED' && (
                  <div className="attempt-status-box expired" role="alert">
                    <h4>Turno Expirado</h4>
                    <p>Tu reserva de cobro ha vencido. Debes reclamar la venta nuevamente para continuar.</p>
                    {attempt.errorMsg && <p className="error-msg-inline">{attempt.errorMsg}</p>}
                    <button
                      type="button"
                      className="checkout-btn"
                      onClick={claimSale}
                      disabled={actionInProgress}
                    >
                      {actionInProgress ? 'Reclamando...' : 'Reclamar Venta'}
                    </button>
                    <button
                      type="button"
                      className="retry-btn-secondary full-width"
                      onClick={handleCloseDetail}
                      disabled={actionInProgress}
                    >
                      Volver a la fila
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
