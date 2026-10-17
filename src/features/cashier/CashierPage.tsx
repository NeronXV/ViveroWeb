import { CounterSaleComposer } from './CounterSaleComposer'
import { hasCapability } from '../access/access-helpers'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { useAuth } from '../auth/useAuth'
import { requireBackendAccess } from '../auth/backend-runtime'
import { useCashierSales } from './useCashierSales'
import { useCashierSaleDetail } from './useCashierSaleDetail'
import { useCashierPaymentAttempt } from './useCashierPaymentAttempt'
import { formatCents, parsePesosToCents } from './cashier-money'
import { isNavigationLocked } from './cashier-payment-state'
import type { CashierPaymentMethod } from './cashier-types'
import { CashierOperations } from './CashierOperations'
import { CashierReceiptHistory } from './CashierReceiptHistory'
import { playCashierSuccessSound } from './cashier-sound'
import { CashierSaleCancellation } from './CashierSaleCancellation'
import { CashierPendingList } from './CashierPendingList'
import { CashierSaleSummary } from './CashierSaleSummary'
import { CashierPaymentPanel } from './CashierPaymentPanel'
import { interruptedCashierPayments, cashierWorkerMessage } from './cashier-desk-state'
import './cashier-desk.css'
import './cashier-pos.css'


export function CashierPage() {
  useDocumentTitle('Caja')
  const { accessContext, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = accessContext?.userId ?? null

  const handleSignOut = async () => {
    if (await signOut()) {
      navigate('/login', { replace: true })
    }
  }

  const [creatingSale, setCreatingSale] = useState(false)
  const canCreateSale = hasCapability(accessContext, 'CREATE_SALES') && hasCapability(accessContext, 'VIEW_CATALOG') && Boolean(accessContext?.branch?.isActive)
  const showComposer = creatingSale && canCreateSale
  useEffect(() => { setCreatingSale(false) }, [userId, accessContext?.branch?.id])
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [patioNote, setPatioNote] = useState<{ saleId: string; note: string | null; error: boolean } | null>(null)
  const [patioReload, setPatioReload] = useState(0)
  const [cancellationLocked, setCancellationLocked] = useState(false)
  const [recoverySaleId, setRecoverySaleId] = useState<string | null>(null)
  const [view, setView] = useState<'detail' | 'charge'>('detail')
  const [searchText, setSearchText] = useState(''), [searchFolio, setSearchFolio] = useState('')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const openedRequest = useRef<string | null>(null)
  const headingRef = useHeadingFocus<HTMLHeadingElement>(selectedSaleId ? `${selectedSaleId}:${view}` : 'cashier-pending')
  let interrupted: ReturnType<typeof interruptedCashierPayments> = [], journalError: string | null = null
  if (userId && typeof window !== 'undefined') {
    try { interrupted = interruptedCashierPayments(window.localStorage, userId) }
    catch { journalError = 'No se pudo leer un cobro guardado. Conserva los datos de este navegador y solicita una revisión antes de cobrar otra venta.' }
  }
  const interruptedId = interrupted[0]?.saleId ?? null
  const anotherInterruptedPayment = interrupted.some(saved => saved.saleId !== selectedSaleId)
  useEffect(() => {
    if (!selectedSaleId && interruptedId) { setView('charge'); setRecoverySaleId(interruptedId); setSelectedSaleId(interruptedId) }
  }, [selectedSaleId, interruptedId])

  // 1. Obtener el detalle de la venta seleccionada
  const {
    saleDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    errorMsg: detailErrorMsg,
    retry: retryDetail,
    clearDetail,
  } = useCashierSaleDetail(selectedSaleId)
  useEffect(() => {
    setPatioNote(null)
    if (!selectedSaleId || !accessContext?.branch) return
    const saleId = Number(selectedSaleId), branchId = Number(accessContext.branch.id)
    if (!Number.isSafeInteger(saleId) || saleId < 1 || !Number.isSafeInteger(branchId) || branchId < 1) return
    const controller = new AbortController()
    void (async () => {
      try {
        const { token } = requireBackendAccess()
        const response = await fetch(`/api/v1/cashier/sales/${saleId}?view=patio`, {
          method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Patio note unavailable')
        const data: unknown = await response.json()
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid patio note')
        const detail = data as Record<string, unknown>
        if (detail.schema_version !== 1 || !detail.sale || typeof detail.sale !== 'object' || Array.isArray(detail.sale)) throw new Error('Invalid sale')
        const sale = detail.sale as Record<string, unknown>, note = detail.patio_note
        if (sale.id !== saleId || sale.branch_id !== branchId || (note !== null && (typeof note !== 'string' || [...note].length > 120))) throw new Error('Invalid patio note')
        if (!controller.signal.aborted) setPatioNote({ saleId: selectedSaleId, note: note as string | null, error: false })
      } catch {
        if (!controller.signal.aborted) setPatioNote({ saleId: selectedSaleId, note: null, error: true })
      }
    })()
    return () => controller.abort()
  }, [selectedSaleId, accessContext?.branch, patioReload])

  // 2. Orquestar el flujo de intento de pago idempotente para la venta activa
  const {
    attempt,
    actionInProgress,
    claimSale,
    releaseClaim,
    confirmPayment,
    reconcilePayment,
    dismissSucceededAttempt,
  } = useCashierPaymentAttempt(userId, saleDetail?.sale ?? (recoverySaleId === selectedSaleId && recoverySaleId ? { id: recoverySaleId } : null))

  const isCriticalPaymentActive = cancellationLocked || Boolean(journalError) || interrupted.length > 0 || Boolean(
    attempt && (
      ['CLAIMING', 'CONFIRMING', 'UNCERTAIN'].includes(attempt.status) ||
      (attempt.status === 'CLAIMED' && actionInProgress)
    )
  )

  // 3. Conservar el coordinador de pendientes y su política de actualización.
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
  } = useCashierSales(15, isCriticalPaymentActive, userId, accessContext?.branch?.id ?? null, searchFolio)

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

  const navigationLocked = cancellationLocked || (attempt ? isNavigationLocked(attempt.status) : false)
  const recoveredPayloadLocked = attempt?.status === 'CLAIMED' && attempt.method !== null

  const handleSelectSale = async (saleId: string, nextView: 'detail' | 'charge' = 'detail') => {
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
    setView(nextView); setOpenRequest(nextView === 'charge' ? saleId : null); openedRequest.current = null
    setRecoverySaleId(interrupted.some(saved => saved.saleId === saleId) ? saleId : null)
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
    setRecoverySaleId(null); setSelectedSaleId(null)
    clearDetail()
  }

  const handleReleaseClaim = async () => {
    const released = await releaseClaim()
    if (!released) return
    setRecoverySaleId(null); setSelectedSaleId(null)
    clearDetail()
    refreshSales()
  }

  const handleFinishedPayment = () => {
    if (!dismissSucceededAttempt()) return
    setRecoverySaleId(null); setSelectedSaleId(null)
    clearDetail()
    refreshSales()
  }

  const handleConfirmPay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!e.currentTarget.checkValidity() || !saleDetail || !attempt || !attempt.claimToken || actionInProgress || cancellationLocked || journalError || anotherInterruptedPayment) return
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

  useEffect(() => {
    if (!openRequest || openRequest !== selectedSaleId || !saleDetail || attempt?.saleId !== selectedSaleId
      || actionInProgress || cancellationLocked || journalError || openedRequest.current === openRequest) return
    openedRequest.current = openRequest
    setOpenRequest(null)
    if (attempt.status === 'CLAIMING') void claimSale()
  }, [openRequest, selectedSaleId, saleDetail, attempt, actionInProgress, cancellationLocked, journalError, claimSale])

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

  const paymentView = view === 'charge' || Boolean(attempt && attempt.status !== 'CLAIMING')
  const deskLocked = navigationLocked || actionInProgress || interrupted.length > 0 || Boolean(journalError)
  const selectedFolio = saleDetail?.sale.folio ?? attempt?.paymentResult?.sale?.folio

  return <main className="internal-page cashier-desk cashier-pos">
    <div className="internal-shell desk-shell">
      <header className="desk-header">
        <div><p className="desk-eyebrow">Vivero Dulcinea · Caja</p>
          <h1 ref={headingRef} tabIndex={-1}>{showComposer ? 'Venta directa' : 'Cobrar pendientes'}</h1>
          <p className="desk-muted">{branchName} · {cashierName}{selectedFolio ? ` · ${selectedFolio}` : ''}</p></div>
        <nav aria-label="Navegación de Caja" className="desk-header-actions">
          {selectedSaleId ? <button type="button" className="desk-secondary" disabled={deskLocked} onClick={() => void handleCloseDetail()}>Volver a pendientes</button>
            : <Link className="desk-secondary" to="/panel">Volver al panel</Link>}
          <button type="button" className="desk-secondary" disabled={deskLocked} onClick={() => void handleSignOut()}>Cerrar sesión</button>
        </nav>
      </header>
      {showComposer && <nav className="pos-modes" aria-label="Modo de venta"><button type="button" disabled={deskLocked}
        onClick={() => setCreatingSale(false)}>Volver a pedidos pendientes</button></nav>}
      {journalError && <p className="desk-warning" role="alert">{journalError}</p>}
      {interrupted.length > 0 && <p className="desk-warning" role="alert">Hay un pago por comprobar. No registres otro cobro ni vuelvas a recibir dinero para esta venta.</p>}
      {anotherInterruptedPayment && selectedSaleId && interruptedId && <button type="button" className="desk-primary" disabled={navigationLocked || actionInProgress}
        onClick={() => void handleSelectSale(interruptedId, 'charge')}>Comprobar pago pendiente</button>}
      {newComandasNotice && <p className="desk-notice" role="status">{newComandasNotice.replace(/comandas?/g, 'ventas')}</p>}
      <div className="pos-workspace" hidden={showComposer}>
      {!showComposer && <section className="desk-card desk-pending" aria-labelledby="desk-pending-title" inert={cancellationLocked}>
        <div className="desk-section-head"><div><h2 id="desk-pending-title">Por cobrar</h2><p className="desk-muted">Selecciona una venta para atender al cliente.</p></div>
          <div className="desk-header-actions">
            <button type="button" className="desk-secondary" disabled={isSalesLoading || isSalesUpdating || deskLocked} onClick={refreshSales}>Actualizar</button>
          </div></div>
        <form className="desk-search" role="search" onSubmit={event => { event.preventDefault(); if (!deskLocked) setSearchFolio(searchText.trim()) }}>
          <label htmlFor="desk-folio-search">Buscar por folio</label>
          <div><input id="desk-folio-search" type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Ej. VD-0042" maxLength={40} disabled={deskLocked} />
            <button className="desk-secondary" type="submit" disabled={deskLocked}>Buscar</button>
            {searchFolio && <button className="desk-secondary" type="button" disabled={deskLocked} onClick={() => { setSearchText(''); setSearchFolio('') }}>Mostrar todas</button>}</div>
          <small>También puedes buscar con el folio anterior.</small>
        </form>
        {(pollingStatus === 'offline' || pollingStatus === 'error') && <p className="desk-warning" role="alert">{pollingStatus === 'offline' ? 'Sin conexión. Conservamos la última lista; verifica la conexión antes de cobrar.' : 'No pudimos actualizar la lista. Se muestra la información anterior.'}</p>}
        {isSalesLoading && <p role="status" className="desk-empty">Cargando ventas…</p>}
        {isSalesError && !sales.length && <div className="desk-warning" role="alert"><p>{cashierWorkerMessage(salesErrorMsg)}</p><button className="desk-secondary" type="button" onClick={refreshSales}>Volver a intentar</button></div>}
        {!isSalesLoading && !isSalesError && !sales.length && <div className="desk-empty"><span aria-hidden="true">❧</span><h3>{searchFolio ? 'Sin coincidencias' : 'Todo al día'}</h3><p>{searchFolio ? 'No hay una venta pendiente con ese folio en esta sucursal.' : 'No hay ventas pendientes de cobro en esta sucursal.'}</p></div>}
        <CashierPendingList compact selectedId={selectedSaleId} sales={sales} locked={deskLocked || isSalesLoading} onCharge={id => void handleSelectSale(id, 'detail')} onDetail={id => void handleSelectSale(id, 'detail')} />
        {hasMore && <button type="button" className="desk-secondary desk-full" disabled={isLoadingMore || deskLocked} onClick={loadMore}>{isLoadingMore ? 'Cargando…' : 'Ver más ventas'}</button>}
        <p className="desk-updated" role="status">{isSalesUpdating ? 'Actualizando ventas…' : lastUpdatedAt ? `Actualizado a las ${lastUpdatedAt}` : 'Las ventas se actualizan automáticamente.'}</p>
      </section>}
      <section className="pos-ticket-pane" aria-label="Venta seleccionada">
      {!selectedSaleId && <div className="desk-card pos-no-selection"><span aria-hidden="true">❧</span><h2>Abre un pedido pendiente</h2><p>Revisa sus plantas y la referencia de patio antes de cobrar.</p></div>}
      {selectedSaleId && <div className={attempt?.status === 'SUCCEEDED' ? 'desk-receipt-layout' : paymentView ? 'desk-payment-layout' : 'desk-detail-layout'} inert={cancellationLocked}>
        <div hidden={attempt?.status === 'SUCCEEDED'}>
          {isDetailLoading && <section className="desk-card" role="status">Cargando productos de la venta…</section>}
          {isDetailError && <section className="desk-card desk-warning" role="alert"><p>{cashierWorkerMessage(detailErrorMsg)}</p>
            <button className="desk-secondary" disabled={actionInProgress} type="button" onClick={retryDetail}>Actualizar venta</button></section>}
          {saleDetail && <CashierSaleSummary detail={saleDetail} />}
          {saleDetail && patioNote?.saleId === selectedSaleId && patioNote.note &&
            <p className="desk-notice"><strong>Referencia de patio:</strong> {patioNote.note}</p>}
          {saleDetail && patioNote?.saleId === selectedSaleId && patioNote.error &&
            <p className="desk-warning" role="alert">No pudimos consultar la referencia de patio. <button type="button" className="desk-secondary"
              onClick={() => setPatioReload(value => value + 1)}>Volver a consultar</button></p>}
          {!paymentView && saleDetail && <div className="desk-detail-actions"><button type="button" className="desk-primary" disabled={deskLocked || saleDetail.sale.claimState === 'CLAIMED_BY_OTHER'}
            onClick={() => { setView('charge'); setOpenRequest(selectedSaleId); openedRequest.current = null }}>Cobrar venta</button></div>}
        </div>
        {paymentView && <CashierPaymentPanel attempt={attempt} busy={actionInProgress || (anotherInterruptedPayment && attempt?.status === 'CLAIMED')} detailReady={Boolean(saleDetail)} blockedByOther={saleDetail?.sale.claimState === 'CLAIMED_BY_OTHER'}
          method={paymentMethod} received={cashReceivedText} reference={referenceText} total={totalCents} change={changeCents} enoughCash={cashReceivedCents >= totalCents}
          error={formError} payloadLocked={recoveredPayloadLocked} onMethod={setPaymentMethod} onReceived={setCashReceivedText} onReference={setReferenceText}
          onConfirm={handleConfirmPay} onOpen={() => void claimSale()} onCheck={() => void reconcilePayment()}
          onBack={() => void (attempt?.status === 'CLAIMED' ? handleReleaseClaim() : handleCloseDetail())} onFinish={handleFinishedPayment} onReload={retryDetail} />}
      </div>}
      </section>
      </div>
      {showComposer && userId && accessContext?.branch && <CounterSaleComposer key={userId + accessContext.branch.id} userId={userId} branchId={accessContext.branch.id}
        onClose={() => setCreatingSale(false)} onCreated={saleId => { setCreatingSale(false); setView('charge'); setOpenRequest(saleId); openedRequest.current = null; setSelectedSaleId(saleId); refreshSales() }} />}
      {!showComposer && <details className="desk-tools"><summary>Más opciones</summary>
        {canCreateSale && <button type="button" className="desk-secondary" disabled={Boolean(selectedSaleId) || deskLocked}
          onClick={() => setCreatingSale(true)}>Venta directa</button>}
        {userId && <CashierSaleCancellation key={`${userId}:${accessContext?.branch?.id}`}
          sale={saleDetail?.sale ?? null} available={!actionInProgress && !journalError && interrupted.length === 0 && attempt?.status === 'CLAIMING'}
          onLocked={setCancellationLocked} onFinished={() => { setRecoverySaleId(null); setSelectedSaleId(null); clearDetail(); refreshSales() }} />}
        {userId && accessContext?.branch && <CashierReceiptHistory key={`${userId}:${accessContext.branch.id}`} userId={userId} branchId={accessContext.branch.id} attempt={attempt} locked={isCriticalPaymentActive} compact />}
        <CashierOperations key={userId} locked={isCriticalPaymentActive} />
      </details>}
    </div>
  </main>
}
