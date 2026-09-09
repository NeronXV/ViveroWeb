import { useEffect, useState } from 'react'
import { operation, object, text } from '../cashier/cashier-operations-service'

function parseActivation(value: unknown) {
  const row = object(value)
  if (row.schemaVersion !== 1 || typeof row.enabled !== 'boolean') throw new Error('Respuesta incompatible.')
  return { branchId: text(row.branchId), enabled: row.enabled }
}
export function InventoryActivation() {
  const [state, setState] = useState<ReturnType<typeof parseActivation> | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    operation('get_my_inventory_activation', {}, parseActivation, controller.signal).then(setState).catch(() => {
      if (!controller.signal.aborted) setError('No fue posible consultar la activación del inventario.')
    })
    return () => controller.abort()
  }, [revision])
  const activate = async () => {
    if (!confirmed || busy) return
    setBusy(true); setError('')
    try { setState(await operation('activate_my_inventory', { p_initial_count_confirmed: true }, parseActivation)) }
    catch { setError('No se confirmó la activación. Actualiza el estado antes de reintentar.') }
    finally { setBusy(false) }
  }
  return <div className="botanical-section-card">
    <h4>Descuento de existencias al cobrar</h4>
    {error && <p role="alert">{error}</p>}
    {!state && <button className="retry-btn-secondary" onClick={() => { setError(''); setRevision((value) => value + 1) }}>Consultar estado</button>}
    {state?.enabled ? <p role="status">Activo: Web y Android descuentan existencias al confirmar nuevos cobros. Un saldo insuficiente impide registrar el pago.</p> : state && <>
      <p>Tu sucursal está en carga inicial: los cobros todavía no descuentan existencias. Completa y revisa el conteo físico antes de activar. No se descontarán ventas anteriores.</p>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo que el inventario inicial de esta sucursal está revisado.</label>
      <button type="button" className="catalog-action" disabled={!confirmed || busy} onClick={activate}>Activar descuento al cobrar</button>
    </>}
  </div>
}
