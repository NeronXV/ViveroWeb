import { useRef, useState, type FormEvent } from 'react'
import { AdminServiceError, fetchInventoryHistory, reconcileInventoryCount, recordInventoryReception } from './admin-service'
import type { InventoryMovement } from './admin-types'
import { useAdminInventory } from './useAdminInventory'

export function AdminInventory({ active, branchName }: { active: boolean; branchName: string }) {
  const inventory = useAdminInventory(active)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ productName: string; items: InventoryMovement[]; hasMore: boolean } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const receptionAttempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const countAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setNotice(null)
    setMutationError(null)
    try {
      const productId = String(data.get('productId'))
      const quantity = Number(data.get('quantity'))
      const notes = String(data.get('notes') ?? '').trim()
      const fingerprint = JSON.stringify({ productId, quantity, notes })
      if (receptionAttempt.current?.fingerprint !== fingerprint) {
        receptionAttempt.current = { fingerprint, key: crypto.randomUUID() }
      }
      const result = await recordInventoryReception({ productId, quantity, notes, idempotencyKey: receptionAttempt.current.key })
      receptionAttempt.current = null
      form.reset()
      setNotice(`Recepción registrada. Existencia actual: ${result.totalQuantity}.`)
      inventory.refresh()
    } catch (error) {
      setMutationError(error instanceof AdminServiceError ? error.message : 'No fue posible registrar la recepción.')
    } finally {
      setSaving(false)
    }
  }

  const submitCount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const data = new FormData(form)
    const productId = String(data.get('productId'))
    const countedQuantity = Number(data.get('countedQuantity'))
    const reason = String(data.get('reason') ?? '').trim()
    const fingerprint = JSON.stringify({ productId, countedQuantity, reason })
    if (countAttempt.current?.fingerprint !== fingerprint) {
      countAttempt.current = { fingerprint, key: crypto.randomUUID() }
    }
    setSaving(true)
    setNotice(null)
    setMutationError(null)
    try {
      const result = await reconcileInventoryCount({
        productId,
        countedQuantity,
        reason,
        idempotencyKey: countAttempt.current.key,
      })
      countAttempt.current = null
      form.reset()
      const adjustment = result.adjustmentQuantity ?? 0
      setNotice(`Conteo conciliado. Ajuste: ${adjustment > 0 ? '+' : ''}${adjustment}; existencia: ${result.totalQuantity}.`)
      inventory.refresh()
    } catch (error) {
      setMutationError(error instanceof AdminServiceError ? error.message : 'No fue posible conciliar el conteo.')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async (productId: string, productName: string) => {
    if (historyLoading) return
    setHistoryLoading(true)
    setMutationError(null)
    try {
      const response = await fetchInventoryHistory(productId)
      setHistory({ productName, items: response.items, hasMore: response.hasMore })
    } catch (error) {
      setMutationError(error instanceof AdminServiceError ? error.message : 'No fue posible cargar el historial.')
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <section className="db-tab-content active" aria-busy={inventory.status === 'loading'}>
      <div className="section-header-row">
        <div><h3>Inventario real</h3><p className="real-data-copy">Sucursal: {branchName}. Movimientos y saldos autoritativos de Supabase.</p></div>
        <button type="button" className="refresh-btn-secondary" onClick={inventory.refresh} disabled={inventory.status === 'loading'}>↻ Actualizar</button>
      </div>

      <form className="dashboard-form" onSubmit={submit}>
        <h4>Registrar recepción</h4>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="inventory-product">Producto</label>
            <select id="inventory-product" name="productId" required disabled={saving || inventory.products.length === 0}>
              <option value="">Selecciona un producto</option>
              {inventory.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="inventory-quantity">Cantidad recibida</label>
            <input id="inventory-quantity" name="quantity" type="number" min="1" max="100000" step="1" required disabled={saving} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="inventory-notes">Notas</label>
          <textarea id="inventory-notes" name="notes" maxLength={240} disabled={saving} />
        </div>
        {notice && <p className="form-notice" role="status">{notice}</p>}
        {mutationError && <p className="admin-page-error" role="alert">{mutationError}</p>}
        <button className="submit-db-btn" disabled={saving || inventory.status !== 'ready'}>{saving ? 'Registrando…' : 'Registrar recepción'}</button>
      </form>

      <form className="dashboard-form" onSubmit={submitCount}>
        <h4>Conciliar conteo físico</h4>
        <p className="real-data-copy">El sistema guarda la diferencia como movimiento auditable; no edita el saldo directamente.</p>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="count-product">Producto</label>
            <select id="count-product" name="productId" required disabled={saving || inventory.products.length === 0}>
              <option value="">Selecciona un producto</option>
              {inventory.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="count-quantity">Existencia contada</label>
            <input id="count-quantity" name="countedQuantity" type="number" min="0" max="100000" step="1" required disabled={saving} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="count-reason">Motivo del conteo</label>
          <textarea id="count-reason" name="reason" minLength={3} maxLength={240} required disabled={saving} />
        </div>
        <button className="submit-db-btn" disabled={saving || inventory.status !== 'ready'}>{saving ? 'Guardando…' : 'Conciliar conteo'}</button>
      </form>

      {inventory.status === 'loading' && <p role="status">Cargando saldos de inventario…</p>}
      {inventory.status === 'error' && <div role="alert"><p>{inventory.error}</p><button type="button" className="retry-btn-secondary" onClick={inventory.refresh}>Reintentar</button></div>}
      {inventory.status === 'ready' && inventory.balances.length === 0 && <p role="status">Todavía no hay movimientos de inventario en esta sucursal.</p>}
      {inventory.balances.length > 0 && (
        <div className="table-responsive"><table className="db-table"><thead><tr><th>Producto</th><th>Código</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Historial</th></tr></thead><tbody>
          {inventory.balances.map((item) => <tr key={item.productId}><td>{item.productName}</td><td>{item.productCode}</td><td>{item.totalQuantity} {item.productUnit}</td><td>{item.minimumStock}</td><td>{item.isLowStock ? '🟡 Bajo' : '🟢 Adecuado'}</td><td><button type="button" className="retry-btn-secondary" disabled={historyLoading} onClick={() => openHistory(item.productId, item.productName)}>Ver</button></td></tr>)}
        </tbody></table></div>
      )}
      {historyLoading && <p role="status">Cargando historial…</p>}
      {history && (
        <section className="dashboard-form" aria-label={`Historial de ${history.productName}`}>
          <div className="section-header-row"><h4>Historial · {history.productName}</h4><button type="button" className="refresh-btn-secondary" onClick={() => setHistory(null)}>Cerrar</button></div>
          {history.items.length === 0 ? <p>No hay movimientos registrados.</p> : (
            <div className="table-responsive"><table className="db-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Motivo</th><th>Registró</th></tr></thead><tbody>
              {history.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('es-MX')}</td><td>{movementLabel(item.movementType)}</td><td>{item.quantity > 0 ? '+' : ''}{item.quantity}</td><td>{item.notes ?? '—'}</td><td>{item.createdByLabel ?? 'Sin etiqueta actual'}</td></tr>)}
            </tbody></table></div>
          )}
          {history.hasMore && <p className="real-data-copy">Se muestran los 50 movimientos más recientes.</p>}
        </section>
      )}
    </section>
  )
}

function movementLabel(value: string): string {
  if (value === 'RECEPTION') return 'Recepción'
  if (value === 'ADJUSTMENT_ADD') return 'Ajuste de entrada'
  if (value === 'ADJUSTMENT_SUB') return 'Ajuste de salida'
  if (value === 'SALE') return 'Venta'
  return 'Movimiento'
}
