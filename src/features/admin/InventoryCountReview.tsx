import { useEffect, useState, type FormEvent } from 'react'
import type { AdminInventoryProductOption } from './admin-types'
import { decideCountObservation, fetchCountObservations, pendingInventoryPreparation, recoverInventoryPreparation, type CountObservation } from './inventory-preparation-service'

export function InventoryCountReview({ canApprove, revision, onChanged, products, productId }: { canApprove: boolean; revision: number; onChanged: () => void; products: AdminInventoryProductOption[]; productId?: string }) {
  const plantName = (id: string) => products.find(product => product.id === id)?.name ?? `Planta ${id}`
  const [items, setItems] = useState<CountObservation[]>([])
  const [selected, setSelected] = useState<CountObservation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasPending, setHasPending] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetchCountObservations(controller.signal).then(rows => { if (!controller.signal.aborted) setItems(productId ? rows.filter(row => row.productId === productId) : rows) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudieron consultar los conteos.') })
    try { setHasPending(pendingInventoryPreparation() !== null) } catch (e) { setError(e instanceof Error ? e.message : 'Revisa el intento guardado.') }
    return () => controller.abort()
  }, [revision, productId])
  const recover = async () => {
    setBusy(true); setError(null)
    try { await recoverInventoryPreparation(); setHasPending(false); onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo comprobar el resultado.') }
    finally { setBusy(false) }
  }
  const decide = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !selected) return
    const data = new FormData(event.currentTarget)
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    if (action !== 'APPROVE' && action !== 'REJECT') return
    setBusy(true); setError(null)
    try { await decideCountObservation(selected.id, action, String(data.get('reason') ?? '')); setSelected(null); onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se confirmó la decisión.'); setHasPending(pendingInventoryPreparation() !== null) }
    finally { setBusy(false) }
  }
  return <section className="inventory-count-review" aria-label="Conteos pendientes" aria-busy={busy}>
    <h4>Conteos por revisar</h4>
    <p>Registrar un conteo no cambia las existencias. Un propietario debe revisar las diferencias.</p>
    {hasPending && <button type="button" className="catalog-action secondary" disabled={busy} onClick={recover}>Comprobar resultado pendiente</button>}
    {error && <p className="admin-page-error" role="alert">{error}</p>}
    {items.length === 0 && <p>No hay conteos pendientes.</p>}
    <ul className="count-review-cards">{items.map(item => <li key={item.id} className="count-review-card"><div className="count-review-heading"><strong>{plantName(item.productId)}</strong><span>Pendiente de revisión</span></div>
      <dl><div><dt>Registrada al contar</dt><dd>{item.baselineQuantity}</dd></div><div><dt>Observada</dt><dd>{item.observedQuantity}</dd></div><div><dt>Diferencia</dt><dd>{item.observedQuantity - item.baselineQuantity > 0 ? '+' : ''}{item.observedQuantity - item.baselineQuantity}</dd></div></dl>
      <p className="count-review-reason">{item.reason}</p>
      {canApprove && <button type="button" className="catalog-action count-review-action" disabled={busy} onClick={() => setSelected(item)}>Revisar conteo<span className="sr-only"> de {plantName(item.productId)}</span></button>}
    </li>)}</ul>
    {selected && canApprove && <form className="dashboard-form" style={{ marginTop: '1rem' }} onSubmit={decide}>
      <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{plantName(selected.productId)} · Diferencia: {selected.observedQuantity - selected.baselineQuantity > 0 ? '+' : ''}{selected.observedQuantity - selected.baselineQuantity}. Se comprobarán los movimientos antes de aplicar.</p>
      <div className="admin-form-group">
        <label htmlFor="count-decision-reason">Motivo de la decisión</label>
        <input id="count-decision-reason" name="reason" required minLength={3} maxLength={240} disabled={busy} placeholder="Explica la aprobación o rechazo…" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <button className="catalog-action" type="submit" value="APPROVE" disabled={busy}>Confirmar aprobación</button>
        <button className="catalog-action secondary" type="submit" value="REJECT" disabled={busy}>Rechazar conteo</button>
        <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => setSelected(null)}>Volver</button>
      </div>
    </form>}
  </section>
}
