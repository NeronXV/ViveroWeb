import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { useAuth } from '../auth/useAuth'
import { useCashierSales } from './useCashierSales'
import { useCashierSaleDetail } from './useCashierSaleDetail'
import { useCashierPaymentAttempt } from './useCashierPaymentAttempt'
import { formatCents, parsePesosToCents } from './cashier-money'
import { isNavigationLocked } from './cashier-payment-state'
import type { CashierPaymentMethod } from './cashier-types'
import { CashierPrintableTicket } from './CashierPrintableTicket'
import { playCashierSuccessSound } from './cashier-sound'


export function CashierPage() {
  useDocumentTitle('Caja')
  const headingRef = useHeadingFocus<HTMLHeadingElement>('cashier')
  const { accessContext, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = accessContext?.userId ?? null

  const handleSignOut = async () => {
    if (await signOut()) {
      navigate('/login', { replace: true })
    }
  }

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  // 1. Obtener el detalle de la venta seleccionada
  const {
    saleDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    errorMsg: detailErrorMsg,
    errorCode: detailErrorCode,
    retry: retryDetail,
    clearDetail,
  } = useCashierSaleDetail(selectedSaleId)

  // 2. Orquestar el flujo de intento de pago idempotente para la venta activa
  const {
    attempt,
    actionInProgress,
    claimSale,
    releaseClaim,
    confirmPayment,
    reconcilePayment,
    dismissSucceededAttempt,
  } = useCashierPaymentAttempt(userId, saleDetail?.sale ?? null)

  const isCriticalPaymentActive = Boolean(
    attempt && (
      ['CLAIMING', 'CONFIRMING', 'UNCERTAIN'].includes(attempt.status) ||
      (attempt.status === 'CLAIMED' && actionInProgress)
    )
  )

  // 3. Obtener la fila de ventas pendientes de Supabase con auto-polling
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
    pollingStatus,
    lastUpdatedAt,
    newComandasNotice,
  } = useCashierSales(15, isCriticalPaymentActive, userId, accessContext?.branch?.id ?? null)

  // Estados locales para el formulario de pago
  const [paymentMethod, setPaymentMethod] = useState<CashierPaymentMethod>('CASH')
  const [cashReceivedText, setCashReceivedText] = useState('')
  const [referenceText, setReferenceText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Limpiar el formulario al cambiar de venta.
  useEffect(() => {
    setCashReceivedText('')
    setReferenceText('')
    setFormError(null)
    setPaymentMethod('CASH')
  }, [selectedSaleId])

  // Un intento recuperado solo puede reenviarse con el payload originalmente persistido.
  useEffect(() => {
    if (!attempt?.method) return
    setPaymentMethod(attempt.method)
    setCashReceivedText(
      attempt.amountReceivedCents === null ? '' : formatCents(attempt.amountReceivedCents),
    )
    setReferenceText(attempt.reference ?? '')
  }, [attempt?.amountReceivedCents, attempt?.method, attempt?.reference])

  const navigationLocked = attempt ? isNavigationLocked(attempt.status) : false
  const recoveredPayloadLocked = attempt?.status === 'CLAIMED' && attempt.method !== null

  const handleSelectSale = async (saleId: string) => {
    if (saleId === selectedSaleId) return
    if (navigationLocked || actionInProgress) {
      setFormError('Concilia el cobro incierto antes de cambiar de venta.')
      return
    }
    // Si ya teníamos una venta seleccionada y reclamada por nosotros, la liberamos antes de cambiar
    if (attempt && attempt.status === 'CLAIMED' && attempt.claimToken) {
      const released = await releaseClaim()
      if (!released) return
    }
    setSelectedSaleId(saleId)
  }

  const handleCloseDetail = async () => {
    if (navigationLocked || actionInProgress) return
    if (attempt && attempt.status === 'CLAIMED' && attempt.claimToken) {
      const released = await releaseClaim()
      if (!released) return
    }
    if (attempt?.status === 'SUCCEEDED') {
      dismissSucceededAttempt()
    }
    setSelectedSaleId(null)
    clearDetail()
  }

  const handleReleaseClaim = async () => {
    const released = await releaseClaim()
    if (!released) return
    setSelectedSaleId(null)
    clearDetail()
    refreshSales()
  }

  const handleFinishedPayment = () => {
    if (!dismissSucceededAttempt()) return
    setSelectedSaleId(null)
    clearDetail()
    refreshSales()
  }

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!saleDetail || !attempt || !attempt.claimToken || actionInProgress) return
    setFormError(null)

    const totalCents = saleDetail.sale.totalCents
    let amountReceivedCents: number | null = null
    let finalReference: string | null = null

    if (paymentMethod === 'CASH') {
      try {
        amountReceivedCents = parsePesosToCents(cashReceivedText)
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Ingresa una cantidad de efectivo válida.')
        return
      }
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

    const succeeded = await confirmPayment(paymentMethod, amountReceivedCents, finalReference)
    if (succeeded) {
      playCashierSuccessSound()
      refreshSales()
    }
  }

  // Cálculos de efectivo y cambio en centavos
  const totalCents = saleDetail?.sale.totalCents ?? 0
  let cashReceivedCents = 0
  try {
    cashReceivedCents = cashReceivedText ? parsePesosToCents(cashReceivedText) : 0
  } catch {
    cashReceivedCents = 0
  }
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
            {newComandasNotice && (
              <div className="module-permission-note" role="status" aria-live="polite" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>🔔</span> <span>{newComandasNotice}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Link className="back-link" to="/panel" style={{ textDecoration: 'none' }}>
              ← Volver al panel
            </Link>
            <button
              type="button"
              className="retry-btn-secondary"
              style={{ margin: 0, padding: '0.45rem 0.85rem', fontSize: '0.85rem', minHeight: 'unset', minWidth: 'unset', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleSignOut}
              disabled={actionInProgress}
            >
              Cerrar sesión
            </button>
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
            <div className="polling-status-indicator" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {pollingStatus === 'active' && (
                <span>🟢 Actualización automática activa (Última: {lastUpdatedAt || '--:--:--'})</span>
              )}
              {pollingStatus === 'offline' && (
                <span style={{ color: '#7a4b00' }}>⚠️ Sin conexión; conservando la última bandeja</span>
              )}
              {pollingStatus === 'error' && (
                <span style={{ color: '#a42929' }}>❌ No se pudo actualizar; mostrando la información anterior</span>
              )}
              {pollingStatus === 'idle' && (
                <span>⏸️ Actualización automática en pausa</span>
              )}
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
                      <button
                        type="button"
                        key={sale.id}
                        className={`sale-card-item ${isSelected ? 'selected' : ''} ${
                          sale.claimState === 'CLAIMED_BY_OTHER' ? 'claimed-by-other' : ''
                        }`}
                        onClick={() => handleSelectSale(sale.id)}
                        disabled={navigationLocked || actionInProgress}
                        aria-pressed={isSelected}
                      >
                        <div className="sale-card-header">
                          <span className="sale-folio">{sale.folio}</span>
                          <span className="sale-time">{formattedDate}</span>
                        </div>
                        <div className="sale-card-body">
                          <p className="sale-total-amount">${formatCents(sale.totalCents)} MXN</p>
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
                      </button>
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
                      disabled={navigationLocked || actionInProgress}
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

                {/* Fase 2: Venta reclamada y lista para confirmar */}
                {attempt.status === 'CLAIMED' && (
                  <div className="attempt-payment-form">
                    <div className="ticket-items-list">
                      {saleDetail.items.map((item, index) => (
                        <div className="ticket-item-row" key={`${item.id}-${index}`}>
                          <div className="ticket-item-name-col">
                            <span className="item-name">{item.productName}</span>
                            <span className="item-price-desc">
                              {item.quantity} × ${formatCents(item.unitPriceCents)}
                            </span>
                          </div>
                          <span className="item-total-price">
                            ${formatCents(item.lineTotalCents)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="ticket-divider" />

                    <div className="ticket-total">
                      <span>Total</span>
                      <strong>${formatCents(saleDetail.sale.totalCents)} MXN</strong>
                    </div>

                    {/* Formulario de Pago */}
                    <form onSubmit={handleConfirmPay} className="payment-method-form">
                      <div className="form-group">
                        <label htmlFor="payment-method-select">Método de Pago</label>
                        <select
                          id="payment-method-select"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as CashierPaymentMethod)}
                          disabled={actionInProgress || recoveredPayloadLocked}
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
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9]+(?:\.[0-9]{1,2})?"
                              value={cashReceivedText}
                              onChange={(e) => setCashReceivedText(e.target.value)}
                              placeholder="0.00"
                              required
                              disabled={actionInProgress || recoveredPayloadLocked}
                            />
                          </div>
                          {cashReceivedCents >= totalCents && (
                            <div className="change-indicator">
                              <span>Cambio a devolver:</span>
                              <strong>${formatCents(changeCents)} MXN</strong>
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
                            maxLength={64}
                            disabled={actionInProgress || recoveredPayloadLocked}
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
                            disabled={actionInProgress || recoveredPayloadLocked}
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
                          onClick={handleReleaseClaim}
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

                    <CashierPrintableTicket result={attempt.paymentResult} />

                    <button type="button" className="checkout-btn" onClick={handleFinishedPayment}>
                      Volver a la fila
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

                {attempt.status === 'UNAVAILABLE' && (
                  <div className="attempt-status-box expired" role="alert">
                    <h4>Venta no disponible</h4>
                    <p>El pago no pertenece a este intento y el claim ya no puede utilizarse.</p>
                    {attempt.errorMsg && <p className="error-msg-inline">{attempt.errorMsg}</p>}
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
