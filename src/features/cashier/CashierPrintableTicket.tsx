import { createPortal } from 'react-dom'
import { useId } from 'react'
import { formatCents } from './cashier-money'
import { buildCashierTicket, PAYMENT_METHOD_LABELS, requestCashierTicketPrint, type CashierTicketModel } from './cashier-ticket'
import type { CashierPaymentResultResponse } from './cashier-types'

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TicketContent({ ticket, portal = false, id, reprint = false }: { ticket: CashierTicketModel; portal?: boolean; id?: string; reprint?: boolean }) {
  return (
      <article id={id} className={`cashier-print-ticket${portal ? ' cashier-ticket-print-portal' : ''}`} aria-label={`Ticket interno ${ticket.folio}`} aria-hidden={portal || undefined}>
        <header className="cashier-ticket-print-header">
          <strong>Vivero Dulcinea</strong>
          <span>{ticket.branchName}</span>
          <h5>Comprobante interno — sin validez fiscal</h5>
          {reprint && <strong>REIMPRESIÓN</strong>}
        </header>

        <dl className="cashier-ticket-print-meta">
          <div><dt>Folio</dt><dd>{ticket.folio}</dd></div>
          <div><dt>Venta</dt><dd>{formatDate(ticket.saleCreatedAt)}</dd></div>
          <div><dt>Pago</dt><dd>{formatDate(ticket.paidAt)}</dd></div>
          {ticket.createdByLabel && <div><dt>Atendió</dt><dd>{ticket.createdByLabel}</dd></div>}
        </dl>

        <div className="cashier-ticket-print-items">
          {ticket.items.map((item) => (
            <div className="cashier-ticket-print-item" key={item.id}>
              <strong>{item.productName}</strong>
              <span>{item.quantity} × ${formatCents(item.unitPriceCents)}</span>
              <b>${formatCents(item.lineTotalCents)}</b>
            </div>
          ))}
        </div>

        <dl className="cashier-ticket-print-totals">
          <div><dt>Subtotal</dt><dd>${formatCents(ticket.subtotalCents)}</dd></div>
          <div><dt>Descuento</dt><dd>-${formatCents(ticket.discountCents)}</dd></div>
          <div className="cashier-ticket-grand-total"><dt>Total</dt><dd>${formatCents(ticket.totalCents)} MXN</dd></div>
          <div><dt>Método</dt><dd>{PAYMENT_METHOD_LABELS[ticket.method]}</dd></div>
          {ticket.method === 'CASH' && (
            <>
              <div><dt>Efectivo recibido</dt><dd>${formatCents(ticket.amountReceivedCents ?? 0)}</dd></div>
              <div><dt>Cambio</dt><dd>${formatCents(ticket.changeCents ?? 0)}</dd></div>
            </>
          )}
          {ticket.reference && <div><dt>Referencia</dt><dd>{ticket.reference}</dd></div>}
        </dl>
      </article>
  )
}

export function CashierPrintableTicket({ result, reprint = false }: { result: CashierPaymentResultResponse; reprint?: boolean }) {
  const portalId = useId()
  const ticket = buildCashierTicket(result)
  if (!ticket) return null

  const printTicket = () => requestCashierTicketPrint(() => window.print(), document.body, document.getElementById(portalId)!)

  return (
    <>
      <TicketContent ticket={ticket} reprint={reprint} />
      {typeof document !== 'undefined' && createPortal(<TicketContent ticket={ticket} portal id={portalId} reprint={reprint} />, document.body)}

      <button type="button" className="checkout-btn cashier-ticket-print-button" onClick={printTicket}>
        {reprint ? 'Reimprimir ticket' : 'Imprimir ticket'}
      </button>
      <p>Selecciona la Black Pos, papel de 58 mm, escala 100 % y desactiva encabezados y pies de página. Puedes volver a imprimir sin repetir el cobro.</p>
    </>
  )
}
