import { useEffect, useState, type FormEvent } from 'react'
import type { AdminProduct } from '../admin-catalog-types'
import { fetchCountBaseline, pendingInventoryPreparation, recordInventoryCountObservation, recoverInventoryPreparation, type CountBaseline } from '../inventory-preparation-service'

export function PlantCount({ product, branchName, canRecord, guard, onBack, onSubmitted }: {
  product: AdminProduct; branchName: string; canRecord: boolean; guard: (dirty: boolean, busy?: boolean) => void; onBack: () => void; onSubmitted: () => void
}) {
  const [baseline, setBaseline] = useState<CountBaseline | null>(null)
  const [quantity, setQuantity] = useState(''), [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false), [revision, setRevision] = useState(0)
  const dirty = quantity !== '' || reason !== ''
  useEffect(() => { guard(dirty, busy) }, [dirty, busy, guard])
  useEffect(() => {
    if (!canRecord) return
    const controller = new AbortController()
    try { setPending(pendingInventoryPreparation() !== null) } catch (e) { setError(e instanceof Error ? e.message : 'Revisa el intento pendiente.'); setPending(true) }
    setBaseline(null)
    fetchCountBaseline(product.id, controller.signal).then(result => { if (!controller.signal.aborted) setBaseline(result) })
      .catch(() => { if (!controller.signal.aborted) setError('No se pudieron consultar las existencias antes de contar. Reintenta.') })
    return () => controller.abort()
  }, [product.id, canRecord, revision])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canRecord || busy || !baseline || pending) return
    setBusy(true); setError(null); guard(dirty, true)
    let sent = false
    try {
      if (!/^\d+$/.test(quantity)) throw new Error('Indica una cantidad entera, incluyendo cero si no hay unidades.')
      await recordInventoryCountObservation({ productId: product.id, countedQuantity: Number(quantity), reason, baseline })
      sent = true; guard(false); onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el conteo.')
      try { setPending(pendingInventoryPreparation() !== null) } catch { setPending(true) }
      // Never replace an original baseline automatically after a failed request.
    } finally { setBusy(false); guard(sent ? false : dirty, false) }
  }
  const recover = async () => {
    setBusy(true); setError(null); guard(dirty, true)
    try {
      const result = await recoverInventoryPreparation(); setPending(false)
      if (result.productId === product.id) { guard(false); onSubmitted() }
      else setError('Se comprobó el resultado pendiente de otra planta. Ahora puedes continuar con este conteo.')
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Todavía no pudimos comprobar el resultado.'); try { setPending(pendingInventoryPreparation() !== null) } catch { setPending(true) } }
    finally { setBusy(false) }
  }
  return <div className="plant-count-page">
    <button className="plants-back" type="button" disabled={busy} onClick={onBack}>← Volver a la ficha</button>
    <div className="plant-count-card"><p className="plants-eyebrow">Observación de conteo físico</p><h4>{product.commonName}</h4><p>{product.internalCode} · {branchName}</p>
      <div className="plant-stock-box"><span>Existencia registrada antes de contar</span><strong>{baseline ? `${Number(baseline.quantity)} ${product.unit}` : 'Consultando…'}</strong></div>
      <p className="plant-count-note">Este envío no cambia las existencias. Un propietario revisará el conteo y aprobará cualquier diferencia.</p>
      {error && <p className="plants-warning" role="alert">{error}</p>}
      {pending && <div className="plants-warning"><p>Hay un resultado pendiente de comprobar. Conservamos el intento original.</p><button type="button" disabled={busy} onClick={recover}>Comprobar resultado</button></div>}
      {!canRecord && <p role="alert">Tu cuenta no tiene autorización para registrar conteos en esta sucursal.</p>}
      <form onSubmit={submit} aria-busy={busy}><label><span>Cantidad contada</span><input inputMode="numeric" type="text" pattern="[0-9]+" required value={quantity} disabled={busy || pending || !canRecord || !baseline} onChange={e => setQuantity(e.target.value)} placeholder="0" /></label>
        <label><span>Observaciones del conteo</span><textarea aria-label="Observaciones del conteo" required minLength={3} maxLength={240} rows={3} value={reason} disabled={busy || pending || !canRecord} onChange={e => setReason(e.target.value)} placeholder="Ej. Conteo físico de la mesa norte" /></label>
        <button type="submit" className="plants-primary" disabled={busy || pending || !canRecord || !baseline}>{busy ? 'Comprobando envío…' : 'Enviar conteo'}</button>
      </form>
      {!pending && !busy && canRecord && <button type="button" className="plants-text-button" onClick={() => { setQuantity(''); setError(null); setRevision(r => r + 1) }}>Consultar de nuevo y comenzar otro conteo</button>}
    </div>
  </div>
}
