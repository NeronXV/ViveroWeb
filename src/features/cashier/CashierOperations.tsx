import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { hasCapability } from '../access/access-helpers'
import { closeCashier, loadClosing, refundSale, lookupRefund, type parseClosingPreview } from './cashier-operations-service'
import { formatPriceCents as formatCents } from '../public-catalog/CatalogProductCard'
import { parsePesosToCents } from './cashier-money'

export function CashierOperations({ locked }: { locked: boolean }) {
  const { accessContext } = useAuth()
  const canRefund = hasCapability(accessContext, 'MANAGE_DISCOUNTS')
  const [preview, setPreview] = useState<ReturnType<typeof parseClosingPreview> | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [refundFolio, setRefundFolio] = useState('')
  const [refundable, setRefundable] = useState<Awaited<ReturnType<typeof lookupRefund>> | null>(null)
  const attempts = useRef<Record<string, { fingerprint: string; key: string }>>({})
  const keyFor = (kind: string, values: unknown) => {
    const fingerprint = JSON.stringify(values)
    if (attempts.current[kind]?.fingerprint !== fingerprint) attempts.current[kind] = { fingerprint, key: crypto.randomUUID() }
    return attempts.current[kind].key
  }
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    loadClosing(controller.signal).then(setPreview).catch(() => {
      if (!controller.signal.aborted) setError('No se pudo consultar el corte. Comprueba que el servicio esté habilitado.')
    })
    return () => controller.abort()
  }, [revision])
  const submitClosing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || locked) return
    const form = event.currentTarget, data = new FormData(form)
    let opening: number, counted: number
    try {
      const parse = (value: string) => /^0(?:\.0{1,2})?$/.test(value) ? 0 : parsePesosToCents(value)
      opening = parse(String(data.get('opening'))); counted = parse(String(data.get('counted')))
    } catch { setError('Indica importes válidos, con hasta dos decimales.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await closeCashier(opening, counted, keyFor('close', [opening, counted]))
      setNotice('Corte registrado. Esperado: ' + formatCents(result.expectedCashCents) + ' · Contado: ' + formatCents(result.countedCashCents) + ' · Diferencia: ' + formatCents(result.differenceCents))
      delete attempts.current.close
      form.reset(); setRevision((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se confirmó el corte.') }
    finally { setBusy(false) }
  }
  const submitRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || locked) return
    const form = event.currentTarget, data = new FormData(form)
    if (!refundable || refundable.alreadyRefunded || refundable.folio !== refundFolio.trim()) return
    const folio = refundable.folio, reason = String(data.get('reason')).trim(), method = String(data.get('method')), restock = data.has('restock')
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await refundSale(folio, reason, method, restock, keyFor('refund', [folio, reason, method, restock]))
      setNotice('Devolución total registrada por ' + formatCents(result.amountCents) + '. No vuelvas a entregar el dinero.')
      setRefundable({ ...refundable, alreadyRefunded: true })
      delete attempts.current.refund
      form.reset(); setRevision((value) => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se confirmó la devolución.') }
    finally { setBusy(false) }
  }
  return <details className="botanical-section-card">
    <summary>Corte de caja y devoluciones</summary>
    <p>Operaciones de tu usuario y sucursal que aún no están incluidas en un corte. El primer corte incluye todo tu historial sin cerrar.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" className="retry-btn-secondary" disabled={busy || locked} onClick={() => setRevision((value) => value + 1)}>Actualizar resumen</button>
    {preview && <><p>Efectivo: {formatCents(preview.payments.cash)} · Tarjeta: {formatCents(preview.payments.card)} · Transferencia: {formatCents(preview.payments.transfer)}</p>
      <p>Neto de operaciones: {formatCents(preview.payments.cash + preview.payments.card + preview.payments.transfer - preview.refunds.cash - preview.refunds.other)}</p>
      <p>Devoluciones en efectivo: {formatCents(preview.refunds.cash)} · Otras: {formatCents(preview.refunds.other)}</p>
      {preview.lastClosing && <p>Último corte: {new Date(preview.lastClosing.createdAt).toLocaleString('es-MX')} · Diferencia: {formatCents(preview.lastClosing.differenceCents)}</p>}
      <form onSubmit={submitClosing}><fieldset disabled={busy || locked}>
        <legend>Registrar corte</legend>
        <label>Fondo inicial en efectivo ($)<input name="opening" type="number" min="0" step="0.01" required /></label>
        <label>Efectivo contado ($)<input name="counted" type="number" min="0" step="0.01" required /></label>
        <label><input type="checkbox" required /> Revisé el efectivo y los cobros pendientes antes de cerrar.</label>
        <button className="catalog-action">Registrar corte</button>
      </fieldset></form></>}
    {canRefund && <form onSubmit={submitRefund}><fieldset disabled={busy || locked}>
      <legend>Registrar devolución total</legend>
      <p>Verifica el ticket original y devuelve el importe total presencialmente. No se ejecutan reembolsos bancarios automáticos.</p>
      <label>Folio de venta<input name="folio" required maxLength={30} value={refundFolio} onChange={(event) => { setRefundFolio(event.target.value); setRefundable(null) }} /></label>
      <button type="button" className="retry-btn-secondary" onClick={async () => {
        setBusy(true); setError(''); setRefundable(null)
        try { setRefundable(await lookupRefund(refundFolio.trim())) }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo consultar el ticket.') }
        finally { setBusy(false) }
      }}>Verificar ticket e importe</button>
      {refundable && <p role="status">{refundable.alreadyRefunded ? 'Esta venta ya fue devuelta. No entregues dinero otra vez.' : 'Importe total a devolver: ' + formatCents(refundable.amountCents)}</p>}
      <label>Motivo<input name="reason" required minLength={5} maxLength={300} /></label>
      <label>Medio usado para devolver<select name="method"><option value="CASH">Efectivo</option><option value="CARD">Tarjeta / terminal</option><option value="TRANSFER">Transferencia</option></select></label>
      <label><input name="restock" type="checkbox" /> Recibí todos los productos en condiciones de volver a venderlos.</label>
      <label><input type="checkbox" required /> Verifiqué el folio y ya devolví el importe completo al cliente.</label>
      <button className="catalog-action" disabled={!refundable || refundable.alreadyRefunded}>Registrar devolución total</button>
    </fieldset></form>}
  </details>
}
