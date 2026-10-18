import { useEffect, useRef, useState } from 'react'
import type { CashierSale } from './cashier-types'
import { cancellationAllowed } from './cashier-cancellation-service'
import { cancelPendingSale, pendingCashierOperation, recoverCashierOperation, completeCashierOperation } from './cashier-operations-service'
import { formatCents } from './cashier-money'

export function CancellationConfirmation({ sale, reason, busy, onReason, onConfirm }: {
  sale: CashierSale; reason: string; busy: boolean; onReason: (value: string) => void; onConfirm: () => void
}) {
  return <form className="dashboard-form" onSubmit={event => { event.preventDefault(); onConfirm() }}>
    <fieldset disabled={busy}>
      <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
        <legend style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Cancelar {sale.folio} · {formatCents(sale.totalCents)}
        </legend>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          La venta dejará de estar disponible para cobro. Si proviene de un pedido web, también se cancelará ese pedido. No se modificarán existencias.
        </p>
        <div className="form-group">
          <label htmlFor="cancellation-reason">Motivo de cancelación</label>
          <textarea id="cancellation-reason" value={reason} onChange={event => onReason(event.target.value)} minLength={3} maxLength={240} required placeholder="Escribe el motivo…" />
        </div>
        <label className="dashboard-confirmation" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" required /> Confirmo que no se recibió dinero y deseo cancelar esta venta.
        </label>
        <button className="retry-btn-secondary" style={{ width: 'fit-content', marginTop: '0.5rem' }} type="submit">Confirmar cancelación</button>
      </div>
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
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {error && <p className="desk-warning" role="alert">{error}</p>}
    {pending && <div className="desk-warning" role="alert"><p>Hay una cancelación por confirmar. Consulta su resultado antes de continuar.</p>
      <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => void run(true)}>Consultar cancelación pendiente</button></div>}
    {allowed && available && sale && !pending && <details className="botanical-section-card" style={{ marginTop: '0.75rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Cancelar venta pendiente</summary>
      <div style={{ marginTop: '0.75rem' }}>
        <CancellationConfirmation sale={sale} reason={reason} busy={busy} onReason={setReason} onConfirm={() => void run(false)} />
      </div>
    </details>}
  </section>
}
