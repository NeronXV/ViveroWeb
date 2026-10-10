import { useEffect, useRef, useState } from 'react'
import type { CashierSale } from './cashier-types'
import { cancellationAllowed } from './cashier-cancellation-service'
import { cancelPendingSale, pendingCashierOperation, recoverCashierOperation, completeCashierOperation } from './cashier-operations-service'
import { formatCents } from './cashier-money'

export function CancellationConfirmation({ sale, reason, busy, onReason, onConfirm }: {
  sale: CashierSale; reason: string; busy: boolean; onReason: (value: string) => void; onConfirm: () => void
}) {
  return <form onSubmit={event => { event.preventDefault(); onConfirm() }}>
    <fieldset disabled={busy}>
      <legend>Cancelar {sale.folio} · {formatCents(sale.totalCents)}</legend>
      <p>La venta dejará de estar disponible para cobro. Si proviene de un pedido web, también se cancelará ese pedido. No se modificarán existencias.</p>
      <label>Motivo de cancelación<textarea value={reason} onChange={event => onReason(event.target.value)} minLength={3} maxLength={240} required /></label>
      <label><input type="checkbox" required /> Confirmo que no se recibió dinero y deseo cancelar esta venta.</label>
      <button className="retry-btn-secondary" type="submit">Confirmar cancelación</button>
    </fieldset>
  </form>
}

export function CashierSaleCancellation({ sale, available, onLocked, onFinished }: {
  sale: CashierSale | null; available: boolean; onLocked: (value: boolean) => void; onFinished: () => void
}) {
  const [allowed, setAllowed] = useState(false), [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const [pending, setPending] = useState(() => {
    try { return pendingCashierOperation()?.kind === 'cancel' } catch { return true }
  })
  const mounted = useRef(false), acting = useRef(false)
  const saleId = sale?.id
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onLocked(busy || pending); return () => onLocked(false) }, [busy, pending, onLocked])
  useEffect(() => {
    const controller = new AbortController()
    setAllowed(false); setReason('')
    if (saleId && available && !pending) cancellationAllowed(saleId, controller.signal).then(value => {
      if (!controller.signal.aborted) setAllowed(value)
    }).catch(() => { /* Failure never enables cancellation. */ })
    return () => controller.abort()
  }, [saleId, available, pending])
  const run = async (recover: boolean) => {
    if (acting.current || (!recover && (!allowed || !available || !sale))) return
    acting.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const result = recover ? await recoverCashierOperation() : await cancelPendingSale(sale!.id, reason)
      // Retain the durable result until it has been validated, including on reload.
      if (!mounted.current) return
      setNotice(result.message)
      await completeCashierOperation(result.attempt)
      if (!mounted.current) return
      setPending(false); setAllowed(false); onFinished()
    } catch (failure) {
      if (mounted.current) {
        setAllowed(false)
        setError(failure instanceof Error ? failure.message : 'No se confirmó la cancelación. Consulta su resultado.')
        try { setPending(pendingCashierOperation()?.kind === 'cancel') } catch { setPending(true) }
      }
    } finally { acting.current = false; if (mounted.current) setBusy(false) }
  }
  return <section aria-label="Cancelación de venta" aria-busy={busy}>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {pending && <><p>Hay una cancelación por confirmar. Consulta su resultado antes de continuar.</p>
      <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => void run(true)}>Consultar cancelación pendiente</button></>}
    {allowed && available && sale && !pending && <details className="botanical-section-card">
      <summary>Cancelar venta pendiente</summary>
      <CancellationConfirmation sale={sale} reason={reason} busy={busy} onReason={setReason} onConfirm={() => void run(false)} />
    </details>}
  </section>
}
