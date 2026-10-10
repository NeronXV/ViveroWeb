import type { FormEvent } from 'react'
import type { CashierPaymentAttempt, CashierPaymentMethod } from './cashier-types'
import { formatCents } from './cashier-money'
import { cashierWorkerMessage } from './cashier-desk-state'
import { CashierPrintableTicket } from './CashierPrintableTicket'

export interface CashierPaymentPanelProps {
  attempt: CashierPaymentAttempt | null; busy: boolean; detailReady: boolean; blockedByOther: boolean
  method: CashierPaymentMethod; received: string; reference: string; total: number; change: number; enoughCash: boolean
  error: string | null; payloadLocked: boolean
  onMethod: (value: CashierPaymentMethod) => void; onReceived: (value: string) => void; onReference: (value: string) => void
  onConfirm: (event: FormEvent<HTMLFormElement>) => void; onOpen: () => void; onCheck: () => void; onBack: () => void; onFinish: () => void; onReload: () => void
}
export function CashierPaymentPanel(props: CashierPaymentPanelProps) {
  const { attempt, busy, detailReady, method, received, reference, payloadLocked } = props
  if (!attempt) return <div className="desk-card" role="status">Preparando el cobro…</div>
  const message = cashierWorkerMessage(attempt.errorMsg)
  if (attempt.status === 'SUCCEEDED' && attempt.paymentResult) return <section className="desk-card desk-success" aria-label="Pago confirmado">
    <span className="desk-success-mark" aria-hidden="true">✓</span><h2>Pago confirmado</h2><p role="status">El comprobante está listo. Puedes imprimirlo sin repetir el cobro.</p>
    <CashierPrintableTicket result={attempt.paymentResult} />
    <button className="desk-secondary" type="button" onClick={props.onFinish}>Volver a ventas pendientes</button>
  </section>
  if (attempt.status === 'UNCERTAIN' || attempt.status === 'CONFIRMING') return <section className="desk-card desk-warning" role={attempt.status === 'UNCERTAIN' ? 'alert' : 'status'}>
    <p className="desk-eyebrow">Comprobación del pago</p><h2>{attempt.status === 'CONFIRMING' ? 'Registrando pago…' : 'Comprobar resultado'}</h2>
    <p>{attempt.status === 'CONFIRMING' ? 'Espera la confirmación. No cierres esta venta ni registres otro cobro.' : 'No recibimos la confirmación del pago. Conservamos tus datos. Comprueba el resultado antes de continuar; no vuelvas a cobrar al cliente.'}</p>
    {message && <p>{message}</p>}
    {attempt.status === 'UNCERTAIN' && <button className="desk-primary" disabled={busy} type="button" onClick={props.onCheck}>{busy ? 'Comprobando…' : 'Comprobar resultado'}</button>}
  </section>
  if (attempt.status === 'CLAIMED' && detailReady) return <section className="desk-card desk-payment" aria-label="Registrar pago">
    <p className="desk-eyebrow">Total a cobrar</p><p className="desk-payment-total">${formatCents(props.total)} <small>MXN</small></p>
    <form onSubmit={props.onConfirm}>
      <fieldset disabled={busy}>
        <legend>Forma de pago</legend>
        <div className="desk-methods">{(['CASH', 'CARD', 'TRANSFER'] as const).map(value => <label key={value} className={method === value ? 'selected' : ''}>
          <input type="radio" name="desk-payment-method" value={value} checked={method === value} disabled={payloadLocked} onChange={() => props.onMethod(value)} />
          {value === 'CASH' ? 'Efectivo' : value === 'CARD' ? 'Tarjeta' : 'Transferencia'}
        </label>)}</div>
        {method === 'CASH' && <><label className="desk-field">Efectivo recibido ($)<input type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={received} onChange={event => props.onReceived(event.target.value)} required disabled={payloadLocked} placeholder="0.00" /></label>
          {props.enoughCash && <div className="desk-change" role="status"><span>Cambio</span><strong>${formatCents(props.change)} MXN</strong></div>}</>}
        {method !== 'CASH' && <label className="desk-field">{method === 'CARD' ? 'Referencia de autorización (opcional)' : 'Referencia de transferencia'}
          <input type="text" value={reference} onChange={event => props.onReference(event.target.value)} required={method === 'TRANSFER'} maxLength={method === 'CARD' ? 64 : 120} disabled={payloadLocked} placeholder={method === 'CARD' ? 'Autorización del terminal' : 'Clave de rastreo o referencia'} /></label>}
        {method !== 'CASH' && <p className="desk-muted">Comprueba que el pago se recibió antes de registrarlo aquí.</p>}
        {payloadLocked && <p className="desk-notice">Estos datos corresponden al cobro guardado. Se conservarán al continuar.</p>}
        {props.error && <p className="desk-warning" role="alert">{cashierWorkerMessage(props.error)}</p>}
        {message && <p className="desk-warning" role="alert">{message}</p>}
        <label className="desk-confirm"><input type="checkbox" required key={`${method}:${received}:${reference}`} /> Confirmo que recibí el pago de esta venta.</label>
        <button className="desk-primary desk-full" type="submit">{busy ? 'Confirmando pago…' : 'Confirmar cobro'}</button>
        <button className="desk-secondary desk-full" type="button" disabled={busy} onClick={props.onBack}>Volver a ventas pendientes</button>
      </fieldset>
    </form>
  </section>
  return <section className="desk-card">
    <h2>{attempt.status === 'EXPIRED' ? 'Volver a abrir cobro' : attempt.status === 'UNAVAILABLE' ? 'Venta no disponible' : 'Cobrar venta'}</h2>
    <p>{attempt.status === 'EXPIRED' ? 'La atención de esta venta se cerró por tiempo. Vuelve a abrir el cobro para continuar.' : attempt.status === 'UNAVAILABLE' ? 'No fue posible continuar este cobro. Revisa el estado de la venta antes de recibir dinero.' : 'Al abrir el cobro, esta venta quedará en tu atención para evitar que otra persona la cobre al mismo tiempo.'}</p>
    {message && <p role="alert" className="desk-warning">{message}</p>}
    {props.blockedByOther && <p role="status">Otra persona está atendiendo esta venta.</p>}
    {detailReady && attempt.status !== 'UNAVAILABLE' && <button type="button" className="desk-primary" disabled={busy || props.blockedByOther} onClick={props.onOpen}>{busy ? 'Abriendo cobro…' : attempt.status === 'EXPIRED' ? 'Volver a abrir cobro' : 'Cobrar venta'}</button>}
    {!detailReady && <button type="button" className="desk-secondary" disabled={busy} onClick={props.onReload}>Actualizar venta</button>}
    <button className="desk-secondary" disabled={busy} type="button" onClick={props.onBack}>Volver a ventas pendientes</button>
  </section>
}
