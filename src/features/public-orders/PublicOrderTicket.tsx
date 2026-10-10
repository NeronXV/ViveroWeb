import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BackendOrderTicket } from './backend-order-service'
import { formatPriceCents } from '../public-catalog/CatalogProductCard'

export type PublicTicketPaper = 'pdf' | 'thermal' | 'thermal58'

export function requestPublicOrderPrint(print: () => void, body: HTMLElement, ticket: HTMLElement, paper: PublicTicketPaper): void {
  // Printing is local presentation only; never call an order/payment service.
  if (body.classList.contains('print-public-order') || body.classList.contains('print-cashier-ticket') || body.classList.contains('print-product-labels')) return
  ticket.classList.add('public-order-ticket-selected')
  body.classList.add('print-public-order', `print-public-order-${paper}`)
  try { print() }
  finally {
    body.classList.remove('print-public-order', `print-public-order-${paper}`)
    ticket.classList.remove('public-order-ticket-selected')
  }
}

export function PublicOrderTicketContent({ ticket, id, portal = false }: { ticket: BackendOrderTicket; id?: string; portal?: boolean }) {
  return <article id={id} className={`public-order-receipt${portal ? ' public-order-ticket-portal' : ''}`} aria-hidden={portal || undefined}>
    <header><strong>Vivero Dulcinea</strong><h4>Comprobante de pedido</h4><b>{ticket.order.order_number}</b></header>
    <p className="public-order-payment-status">{ticket.order.status === 'CANCELLED' ? 'Pedido cancelado' : 'Pendiente de pago en sucursal'}</p>
    <dl className="public-order-receipt-meta">
      <div><dt>Fecha del pedido</dt><dd>{new Date(ticket.order.created_at).toLocaleString('es-MX')}</dd></div>
      <div><dt>Sucursal</dt><dd>{ticket.branch.name} ({ticket.branch.code})</dd></div>
    </dl>
    <div className="public-order-receipt-items">{ticket.items.map(item => <div className="public-order-receipt-item" key={item.product_id}>
      <strong>{item.product_name}</strong>
      <span>{item.quantity} × {formatPriceCents(item.unit_price_cents)}</span><b>{formatPriceCents(item.line_total_cents)}</b>
    </div>)}</div>
    <dl className="public-order-receipt-totals">
      <div><dt>Subtotal</dt><dd>{formatPriceCents(ticket.subtotal_cents)}</dd></div>
      {ticket.discount_cents > 0 && <div><dt>Descuento</dt><dd>−{formatPriceCents(ticket.discount_cents)}</dd></div>}
      <div className="public-order-receipt-total"><dt>Total MXN</dt><dd>{formatPriceCents(ticket.order.total_cents)}</dd></div>
    </dl>
    <p>{ticket.order.status === 'CANCELLED' ? 'Este pedido está cancelado y no está disponible para cobro.' : 'Presenta este folio en Caja para pagar y recoger tu pedido.'}</p>
    <p className="public-order-receipt-note">Comprobante del pedido al registrarse. No acredita pago ni sustituye el comprobante de Caja.</p>
  </article>
}

export function PublicOrderTicket({ ticket }: { ticket: BackendOrderTicket }) {
  const portalId = useId()
  const [paper, setPaper] = useState<PublicTicketPaper>('pdf')
  const [copyMessage, setCopyMessage] = useState('')
  const print = () => {
    const target = document.getElementById(portalId)
    if (target) requestPublicOrderPrint(() => window.print(), document.body, target, paper)
  }
  return <>
    <PublicOrderTicketContent ticket={ticket} />
    {typeof document !== 'undefined' && createPortal(<PublicOrderTicketContent ticket={ticket} id={portalId} portal />, document.body)}
    <div className="public-order-print-controls">
      <label>Formato<select value={paper} onChange={event => setPaper(event.target.value as PublicTicketPaper)}><option value="pdf">PDF / papel A4</option><option value="thermal">Térmica de 80 mm</option><option value="thermal58">Térmica de 58 mm</option></select></label>
      <button type="button" className="checkout-btn" onClick={print}>Imprimir / Guardar comprobante</button>
      <button type="button" className="catalog-action" onClick={() => {
        if (!navigator.clipboard) { setCopyMessage('Selecciona el folio para copiarlo.'); return }
        void navigator.clipboard.writeText(ticket.order.order_number).then(() => setCopyMessage('Folio copiado.'), () => setCopyMessage('Selecciona el folio para copiarlo.'))
      }}>Copiar folio</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
      <p>Usa escala 100 % y desactiva encabezados y pies del navegador. En la impresora, selecciona el mismo ancho de papel que aquí.</p>
    </div>
  </>
}
