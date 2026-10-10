import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import imageFallback from '../../assets/isotipo-flor.svg'
import { usePublicCart } from '../public-orders/PublicCartProvider'
import { BackendOrderError, createBackendOrderService, createBackendOrderAttempt, readBackendOrderAttempt,
  readBackendOrderTicket, type BackendOrderTicket, type BackendOrderAttempt, type BackendOrderSubmission } from '../public-orders/backend-order-service'
import { browserOrderLock, createBackendOrderCoordinator } from '../public-orders/backend-order-coordinator'
import { PublicOrderTicket } from '../public-orders/PublicOrderTicket'
import type { PublicOrderBranch } from '../public-orders/web-order-types'
import { resolvePublicCatalogImageUrl } from './catalog-image'
import { formatPriceCents } from './CatalogProductCard'

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, estimatedTotalCents, changeQuantity, removeProduct, clearCart } = usePublicCart()
  const [branches, setBranches] = useState<PublicOrderBranch[]>([])
  const [optionsState, setOptionsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [branchId, setBranchId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [prepared, setPrepared] = useState<BackendOrderAttempt | null>(null)
  const [pending, setPending] = useState<BackendOrderAttempt | null>(null)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const operationRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<BackendOrderTicket | null>(null)
  const [lastTicket, setLastTicket] = useState<BackendOrderTicket | null>(null)
  const cartSignature = useMemo(() => items.map((item) => `${item.product.id}:${item.quantity}`).join('|'), [items])
  const formRevision = useRef(0)

  useEffect(() => { formRevision.current += 1; setPrepared(null) }, [cartSignature, branchId, customerName, customerPhone, customerEmail, notes])
  useEffect(() => {
    try { setPending(readBackendOrderAttempt(window.localStorage)) }
    catch { setStorageBlocked(true); setError('No se pudo leer el intento guardado. No envíes otro pedido hasta revisar el almacenamiento.') }
  }, [])

  useEffect(() => {
    try { setLastTicket(readBackendOrderTicket(window.localStorage)) }
    catch { setError('No se pudo leer el comprobante anterior. Su copia guardada se conserva.') }
  }, [])

  const optionsLoadedRef = useRef(false)

  const loadBranches = useCallback((signal?: AbortSignal) => {
    setOptionsState('loading')
    createBackendOrderService().options(signal)
      .then((result) => {
        setBranches(result.branches.map(branch => ({ ...branch, id: String(branch.id) })))
        setBranchId((current) => current || String(result.branches[0]?.id ?? ''))
        setOptionsState('ready')
        optionsLoadedRef.current = true
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'No fue posible cargar las sucursales.')
        setOptionsState('error')
        optionsLoadedRef.current = false
      })
  }, [])

  useEffect(() => {
    if (!open || optionsLoadedRef.current) return
    const controller = new AbortController()
    loadBranches(controller.signal)
    return () => controller.abort()
  }, [open, loadBranches])

  const retryBranches = () => {
    setError('')
    loadBranches()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (items.length === 0 || operationRef.current || storageBlocked || pending) return
    if (customerPhone.trim() === '' && customerEmail.trim() === '') {
      setError('Escribe un teléfono o correo para que podamos confirmar tu pedido.')
      return
    }
    operationRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const currentEmail = customerEmail.trim()
      const currentPhone = customerPhone.trim()
      const currentName = customerName.trim()

      const service = createBackendOrderService(fetch, true)
      const input = { branch_id: Number(branchId), items: items.map(item => ({ product_id: Number(item.product.id), quantity: item.quantity })) }
      if (!prepared) {
        const expectedRevision = formRevision.current
        const quote = await service.quote(input)
        // A late quote cannot replace a cart/contact/branch edited while awaiting it.
        if (expectedRevision !== formRevision.current) return
        setPrepared(createBackendOrderAttempt({ ...input, customer_name: currentName, customer_phone: currentPhone || null,
          customer_email: currentEmail || null, notes: notes.trim() || null, expected_total_cents: quote.total_cents }))
        return
      }
      setPending(prepared)
      const receipt = await createBackendOrderCoordinator(window.localStorage, service, browserOrderLock).send(prepared)
      if (!receipt.ticket) throw new Error('Falta el comprobante confirmado.')
      setConfirmation(receipt.ticket)
      setLastTicket(receipt.ticket)
      clearCart()
      setPending(null)
      setPrepared(null)
    } catch (reason) {
      try { setPending(readBackendOrderAttempt(window.localStorage)) }
      catch { setStorageBlocked(true) }
      setError(reason instanceof BackendOrderError ? reason.message : 'No se pudo confirmar el pedido o guardar su intento. Conserva el contenido y recupera el resultado.')
    } finally {
      setSubmitting(false)
      operationRef.current = false
    }
  }
  const recoverPending = async () => {
    if (!pending || operationRef.current) return
    operationRef.current = true; setSubmitting(true); setError('')
    try {
      const service = createBackendOrderService(fetch, true)
      const receipt = await createBackendOrderCoordinator(window.localStorage, service, browserOrderLock).recover(pending)
      if (!receipt.ticket) throw new Error('Falta el comprobante confirmado.')
      setConfirmation(receipt.ticket)
      setLastTicket(receipt.ticket)
      clearCart(); setPending(null); setPrepared(null)
    } catch (reason) { setError(reason instanceof BackendOrderError ? reason.message : 'No se confirmó el resultado. El intento se conserva.') }
    finally { setSubmitting(false); operationRef.current = false }
  }

  return <>
    <button className={`cart-overlay ${open ? 'open' : ''}`} onClick={onClose} aria-label="Cerrar carrito" tabIndex={open ? 0 : -1} />
    <aside className={`cart-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-labelledby="cart-title">
      <div className="cart-header"><h3 id="cart-title">{confirmation ? 'Comprobante de Pedido' : 'Tu pedido'}</h3><button className="close-cart-btn" onClick={onClose} aria-label="Cerrar carrito">×</button></div>
      {!confirmation && !pending && lastTicket && <button type="button" className="catalog-action" onClick={() => setConfirmation(lastTicket)}>Ver último comprobante guardado</button>}
      {confirmation ? (
        <div className="web-order-ticket">
          <PublicOrderTicket ticket={confirmation} />
          <button type="button" className="catalog-action" onClick={() => { setConfirmation(null); onClose() }}>Listo, volver a la tienda</button>
        </div>
      ) : pending ? (
        <div className="cart-footer">
          <p>Hay un pedido pendiente de confirmar. Se conservarán su contacto, productos, total y clave originales.</p>
          <p>Primero se consultará el resultado; solo si no existe se reenviará el mismo pedido.</p>
          <button type="button" className="checkout-btn" disabled={submitting} onClick={() => void recoverPending()}>{submitting ? 'Consultando…' : 'Recuperar o reenviar pedido original'}</button>
          <p role="alert">{error}</p>
        </div>
      ) : (
        <form className="web-order-form" onSubmit={submit} aria-busy={submitting}>
          <div className="cart-items">
            {items.length === 0 && <div className="cart-empty-msg">Tu carrito está vacío. ¡Explora nuestro catálogo!</div>}
            {items.map((item) => {
              const image = resolvePublicCatalogImageUrl(item.product.image) ?? imageFallback
              return <div className="cart-item" key={item.product.id}>
                <img src={image} alt="" className="cart-item-img" />
                <div className="cart-item-details"><h4>{item.product.name}</h4><div className="cart-item-price">{formatPriceCents(item.product.price.amountCents)}</div><div className="cart-item-qty"><button type="button" className="qty-btn" onClick={() => changeQuantity(item.product.id, -1)} aria-label={`Quitar una unidad de ${item.product.name}`}>−</button><span aria-label={`${item.quantity} unidades`}>{item.quantity}</span><button type="button" className="qty-btn" onClick={() => changeQuantity(item.product.id, 1)} aria-label={`Agregar una unidad de ${item.product.name}`}>+</button></div></div>
                <button type="button" className="remove-item-btn" onClick={() => removeProduct(item.product.id)} aria-label={`Eliminar ${item.product.name}`}>🗑</button>
              </div>
            })}
          </div>
          <div className="cart-footer">
            <div className="cart-total-row"><span>{prepared ? 'Total cotizado:' : 'Total estimado:'}</span><span>{formatPriceCents(prepared ? (JSON.parse(prepared.body) as BackendOrderSubmission).expected_total_cents : estimatedTotalCents)}</span></div>
            <p className="web-order-help">El servidor confirmará precios y promociones al enviar el pedido.</p>
            {items.length > 0 && <div className="web-order-fields">
              <label>Nombre completo<input required minLength={2} maxLength={160} autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label>Teléfono<input maxLength={24} inputMode="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
              <label>Correo electrónico <small>(opcional si proporcionas teléfono)</small><input type="email" maxLength={254} autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
              <label>Sucursal de recolección<select required value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={optionsState !== 'ready'}><option value="" disabled>{optionsState === 'loading' ? 'Cargando sucursales disponibles…' : optionsState === 'error' ? 'Error al cargar sucursales' : 'Selecciona una sucursal'}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>
              <label>Notas <small>(opcional)</small><textarea maxLength={500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            </div>}
            <button className="checkout-btn" type="submit" disabled={storageBlocked || items.length === 0 || branchId === '' || optionsState !== 'ready' || submitting}>{submitting ? 'Procesando…' : prepared ? 'Confirmar pedido con total cotizado' : 'Cotizar pedido'}</button>
            {optionsState === 'error' && <button type="button" className="catalog-action" onClick={retryBranches} style={{ marginTop: '0.6rem', width: '100%' }}>↻ Reintentar sucursales</button>}
            <p className="form-notice web-order-error" role={error ? 'alert' : undefined} aria-live="polite">{error}</p>
          </div>
        </form>
      )}
    </aside>
  </>
}
