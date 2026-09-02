import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import imageFallback from '../../assets/isotipo-flor.svg'
import { usePublicCart } from '../public-orders/PublicCartProvider'
import { loadPublicOrderOptions, submitWebOrder, WebOrderServiceError } from '../public-orders/web-order-service'
import type { PublicOrderBranch, SubmitWebOrderResult } from '../public-orders/web-order-types'
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
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<SubmitWebOrderResult | null>(null)
  const [submittedDetails, setSubmittedDetails] = useState<{
    branchName: string
    customerName: string
    customerEmail: string
    customerPhone: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const cartSignature = useMemo(() => items.map((item) => `${item.product.id}:${item.quantity}`).join('|'), [items])

  useEffect(() => { setAttemptId(null); setError('') }, [cartSignature])

  const optionsLoadedRef = useRef(false)

  const loadBranches = useCallback((signal?: AbortSignal) => {
    setOptionsState('loading')
    loadPublicOrderOptions(signal)
      .then((result) => {
        setBranches(result.branches)
        setBranchId((current) => current || result.branches[0]?.id || '')
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

  const handleCopyOrderNumber = (num: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(num).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2200)
      }).catch(() => {})
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (items.length === 0 || submitting) return
    if (customerPhone.trim() === '' && customerEmail.trim() === '') {
      setError('Escribe un teléfono o correo para que podamos confirmar tu pedido.')
      return
    }
    const orderId = attemptId ?? window.crypto.randomUUID()
    setAttemptId(orderId)
    setSubmitting(true)
    setError('')
    try {
      const selectedBranch = branches.find((b) => b.id === branchId)
      const currentEmail = customerEmail.trim()
      const currentPhone = customerPhone.trim()
      const currentName = customerName.trim()
      const branchDisplay = selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : 'Sucursal seleccionada'

      const result = await submitWebOrder({
        orderId,
        branchId,
        customerName: currentName,
        customerPhone: currentPhone,
        customerEmail: currentEmail,
        notes,
        items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      })

      setSubmittedDetails({
        branchName: branchDisplay,
        customerName: currentName,
        customerEmail: currentEmail,
        customerPhone: currentPhone,
      })
      setConfirmation(result)
      clearCart()
      setAttemptId(null)
    } catch (reason) {
      setError(reason instanceof WebOrderServiceError ? reason.message : 'No fue posible enviar el pedido. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return <>
    <button className={`cart-overlay ${open ? 'open' : ''}`} onClick={onClose} aria-label="Cerrar carrito" tabIndex={open ? 0 : -1} />
    <aside className={`cart-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-labelledby="cart-title">
      <div className="cart-header"><h3 id="cart-title">{confirmation ? 'Comprobante de Pedido' : 'Tu pedido'}</h3><button className="close-cart-btn" onClick={onClose} aria-label="Cerrar carrito">×</button></div>
      {confirmation ? (
        <div className="web-order-ticket" role="status" aria-live="polite">
          <div className="ticket-badge-pill">✓ Pedido Registrado</div>
          <h4 style={{ margin: '0.35rem 0 0.2rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
            ¡Gracias por tu compra!
          </h4>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Tu pedido está listo para ser preparado en sucursal.
          </p>

          <div className="order-ticket-card">
            <div className="order-ticket-header">
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', fontWeight: 700 }}>
                Folio de Pedido / Venta
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <strong className="order-ticket-number">{confirmation.orderNumber}</strong>
                <button
                  type="button"
                  className="copy-folio-btn"
                  onClick={() => handleCopyOrderNumber(confirmation.orderNumber)}
                  title="Copiar número de folio"
                >
                  {copied ? '✓ Copiado' : '📋 Copiar'}
                </button>
              </div>
            </div>

            <div className="order-ticket-divider" />

            <div className="order-ticket-rows">
              <div className="order-ticket-row">
                <span>Sucursal de entrega:</span>
                <strong>{submittedDetails?.branchName ?? 'Sucursal seleccionada'}</strong>
              </div>
              <div className="order-ticket-row">
                <span>Cliente:</span>
                <strong>{submittedDetails?.customerName ?? 'Cliente'}</strong>
              </div>
              {submittedDetails?.customerPhone && (
                <div className="order-ticket-row">
                  <span>Teléfono:</span>
                  <span>{submittedDetails.customerPhone}</span>
                </div>
              )}
              {submittedDetails?.customerEmail && (
                <div className="order-ticket-row">
                  <span>Correo:</span>
                  <span>{submittedDetails.customerEmail}</span>
                </div>
              )}
              <div className="order-ticket-divider" />
              <div className="order-ticket-row total">
                <span>Total a pagar en sucursal:</span>
                <strong className="ticket-total-value">{formatPriceCents(confirmation.totalCents)} MXN</strong>
              </div>
            </div>
          </div>

          {submittedDetails?.customerEmail && (
            <div className="order-ticket-email-note">
              ✉️ Te enviamos la confirmación y los detalles de pago a <strong>{submittedDetails.customerEmail}</strong>.
            </div>
          )}

          <div className="order-ticket-instructions">
            <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              ¿Cómo recoger tu pedido?
            </p>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <li>Presenta tu número de folio en el área de cajas.</li>
              <li>Paga al momento en efectivo, tarjeta o transferencia.</li>
              <li>¡Lleva tus plantas frescas y listas a casa!</li>
            </ol>
          </div>

          <div className="order-ticket-actions">
            <button
              type="button"
              className="retry-btn-secondary"
              onClick={() => window.print()}
              style={{ width: '100%', padding: '0.65rem', fontSize: '0.88rem' }}
            >
              🖨️ Imprimir / Guardar Ticket
            </button>
            <button
              type="button"
              className="catalog-action"
              onClick={() => { setConfirmation(null); onClose() }}
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
            >
              Listo, volver a la tienda
            </button>
          </div>
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
            <div className="cart-total-row"><span>Total estimado:</span><span>{formatPriceCents(estimatedTotalCents)}</span></div>
            <p className="web-order-help">El servidor confirmará precios y promociones al enviar el pedido.</p>
            {items.length > 0 && <div className="web-order-fields">
              <label>Nombre completo<input required minLength={2} maxLength={160} autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
              <label>Teléfono<input maxLength={24} inputMode="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
              <label>Correo electrónico <small>(opcional si proporcionas teléfono)</small><input type="email" maxLength={254} autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></label>
              <label>Sucursal de recolección<select required value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={optionsState !== 'ready'}><option value="" disabled>{optionsState === 'loading' ? 'Cargando sucursales disponibles…' : optionsState === 'error' ? 'Error al cargar sucursales' : 'Selecciona una sucursal'}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>
              <label>Notas <small>(opcional)</small><textarea maxLength={500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            </div>}
            <button className="checkout-btn" type="submit" disabled={items.length === 0 || branchId === '' || optionsState !== 'ready' || submitting}>{submitting ? 'Enviando pedido…' : 'Enviar pedido'}</button>
            {optionsState === 'error' && <button type="button" className="catalog-action" onClick={retryBranches} style={{ marginTop: '0.6rem', width: '100%' }}>↻ Reintentar sucursales</button>}
            <p className="form-notice web-order-error" role={error ? 'alert' : undefined} aria-live="polite">{error}</p>
          </div>
        </form>
      )}
    </aside>
  </>
}
