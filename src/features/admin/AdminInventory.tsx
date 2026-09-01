import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AdminServiceError, fetchInventoryHistory, reconcileInventoryCount, recordInventoryReception } from './admin-service'
import type { InventoryMovement } from './admin-types'
import { useAdminInventory } from './useAdminInventory'

export function AdminInventory({
  active,
  branchName,
  initialProductId,
  onClearInitialProductId,
  onManageProducts,
}: {
  active: boolean
  branchName: string
  initialProductId?: string | null
  onClearInitialProductId?: () => void
  onManageProducts?: () => void
}) {
  const inventory = useAdminInventory(active)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ productName: string; items: InventoryMovement[]; hasMore: boolean } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const receptionAttempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const countAttempt = useRef<{ fingerprint: string; key: string } | null>(null)

  // Modales de acciones rápidas
  const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false)
  const [isCountModalOpen, setIsCountModalOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out' | 'adequate'>('all')

  // Abrir modales con producto preseleccionado
  const openReception = useCallback((productId?: string) => {
    setSelectedProductId(productId || (inventory.products[0]?.id ?? ''))
    setMutationError(null)
    setIsReceptionModalOpen(true)
  }, [inventory.products])

  const openCount = useCallback((productId?: string) => {
    setSelectedProductId(productId || (inventory.products[0]?.id ?? ''))
    setMutationError(null)
    setIsCountModalOpen(true)
  }, [inventory.products])

  useEffect(() => {
    if (active && initialProductId && inventory.status === 'ready' && inventory.products.length > 0) {
      openReception(initialProductId)
      onClearInitialProductId?.()
    }
  }, [active, initialProductId, inventory.status, inventory.products.length, onClearInitialProductId, openReception])

  const submitReception = async (event: FormEvent<HTMLFormElement>) => {
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
      setIsReceptionModalOpen(false)
      setNotice(`Recepción registrada exitosamente. Existencia actual: ${result.totalQuantity}.`)
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
      setIsCountModalOpen(false)
      const adjustment = result.adjustmentQuantity ?? 0
      setNotice(`Conteo conciliado. Ajuste: ${adjustment > 0 ? '+' : ''}${adjustment}; existencia final: ${result.totalQuantity}.`)
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

  // Métricas calculadas sobre balances
  const stats = useMemo(() => {
    let inStock = 0
    let lowStock = 0
    let outOfStock = 0
    for (const b of inventory.balances) {
      if (b.totalQuantity <= 0) {
        outOfStock++
      } else if (b.isLowStock) {
        lowStock++
      } else {
        inStock++
      }
    }
    return {
      total: inventory.balances.length,
      inStock,
      lowStock,
      outOfStock,
    }
  }, [inventory.balances])

  // Filtrado interactivo
  const filteredBalances = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return inventory.balances.filter((item) => {
      const matchesSearch =
        !query ||
        item.productName.toLowerCase().includes(query) ||
        item.productCode.toLowerCase().includes(query)

      if (!matchesSearch) return false

      if (statusFilter === 'out') return item.totalQuantity <= 0
      if (statusFilter === 'low') return item.totalQuantity > 0 && item.isLowStock
      if (statusFilter === 'adequate') return item.totalQuantity > 0 && !item.isLowStock

      return true
    })
  }, [inventory.balances, searchQuery, statusFilter])

  return (
    <section className="db-tab-content active" aria-busy={inventory.status === 'loading' || saving}>
      {/* Cabecera Principal */}
      <div className="section-header-row">
        <div>
          <h3>Control de Existencias y Stock</h3>
          <p className="real-data-copy">
            Sucursal: <strong>{branchName}</strong> · Saldos y movimientos autoritativos en tiempo real.
          </p>
        </div>
        <div className="admin-actions-cell" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {onManageProducts && (
            <button
              type="button"
              className="catalog-action"
              onClick={onManageProducts}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span>🌿</span> + Nueva Planta / Producto
            </button>
          )}
          <button
            type="button"
            className="catalog-action secondary"
            onClick={() => openReception()}
            disabled={inventory.products.length === 0}
          >
            📥 Registrar Entrada
          </button>
          <button
            type="button"
            className="catalog-action secondary"
            onClick={() => openCount()}
            disabled={inventory.products.length === 0}
          >
            📝 Conciliar Conteo
          </button>
          <button
            type="button"
            className="refresh-btn-secondary"
            onClick={inventory.refresh}
            disabled={inventory.status === 'loading' || saving}
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {notice && <p className="form-notice" role="status">{notice}</p>}
      {mutationError && <p className="admin-page-error" role="alert">{mutationError}</p>}

      {/* Barra de Estadísticas de Inventario */}
      {inventory.status === 'ready' && inventory.balances.length > 0 && (
        <div className="inventory-toolbar">
          <div className="inventory-stats-bar">
            <div className="inventory-stat-item">
              <span className="inventory-stat-label">Total Catálogo</span>
              <span className="inventory-stat-value">{stats.total}</span>
            </div>
            <div className="inventory-stat-item">
              <span className="inventory-stat-label">En Existencia</span>
              <span className="inventory-stat-value" style={{ color: 'hsl(145, 70%, 35%)' }}>
                🟢 {stats.inStock}
              </span>
            </div>
            <div className="inventory-stat-item">
              <span className="inventory-stat-label">Stock Bajo</span>
              <span className="inventory-stat-value" style={{ color: 'hsl(35, 95%, 40%)' }}>
                🟡 {stats.lowStock}
              </span>
            </div>
            <div className="inventory-stat-item">
              <span className="inventory-stat-label">Agotados</span>
              <span className="inventory-stat-value" style={{ color: 'hsl(0, 85%, 50%)' }}>
                🔴 {stats.outOfStock}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar por planta o código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--surface-border)',
                minWidth: '220px',
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--surface-border)',
              }}
            >
              <option value="all">Todos los niveles</option>
              <option value="adequate">🟢 Existencia normal</option>
              <option value="low">🟡 Stock bajo</option>
              <option value="out">🔴 Agotados</option>
            </select>
          </div>
        </div>
      )}

      {inventory.status === 'loading' && (
        <div className="cashier-status-container" role="status" aria-live="polite">
          <div className="loading-spinner" />
          <p>Cargando existencias de la sucursal…</p>
        </div>
      )}

      {inventory.status === 'error' && (
        <div className="admin-directory-error" role="alert">
          <p className="error-copy">{inventory.error}</p>
          <button type="button" className="retry-btn-secondary" onClick={inventory.refresh}>
            Reintentar
          </button>
        </div>
      )}

      {inventory.status === 'ready' && inventory.products.length === 0 && (
        <div className="dashboard-form" role="status">
          <h4>Sin productos registrados</h4>
          <p className="real-data-copy">Todavía no hay productos registrados en el catálogo para registrar existencias en esta sucursal.</p>
          {onManageProducts && (
            <button
              type="button"
              className="catalog-action"
              onClick={onManageProducts}
              style={{ marginTop: '0.75rem' }}
            >
              🌿 Dar de alta primer producto / planta
            </button>
          )}
        </div>
      )}

      {/* Tabla de Saldos y Existencias */}
      {inventory.status === 'ready' && inventory.balances.length > 0 && (
        <>
          {filteredBalances.length === 0 ? (
            <p className="no-records-copy" role="status">
              No hay productos que coincidan con los filtros aplicados.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="db-table">
                <thead>
                  <tr>
                    <th>Planta / Producto</th>
                    <th>Código</th>
                    <th>Existencia Actual</th>
                    <th>Mínimo Alerta</th>
                    <th>Estado</th>
                    <th>Acciones Rápidas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((item) => {
                    const isOut = item.totalQuantity <= 0
                    const isLow = !isOut && item.isLowStock

                    return (
                      <tr key={item.productId}>
                        <td>
                          <strong>{item.productName}</strong>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.85rem' }}>{item.productCode}</code>
                        </td>
                        <td>
                          <strong style={{ fontSize: '1rem' }}>
                            {item.totalQuantity} <small style={{ color: 'var(--text-secondary)' }}>{item.productUnit}</small>
                          </strong>
                        </td>
                        <td>
                          {item.minimumStock} <small style={{ color: 'var(--text-secondary)' }}>{item.productUnit}</small>
                        </td>
                        <td>
                          {isOut && (
                            <span className="stock-status-badge out-of-stock">
                              ● Agotado
                            </span>
                          )}
                          {isLow && (
                            <span className="stock-status-badge low-stock">
                              ● Stock Bajo
                            </span>
                          )}
                          {!isOut && !isLow && (
                            <span className="stock-status-badge in-stock">
                              ● Normal
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="stock-row-actions">
                            <button
                              type="button"
                              className="mini-action-btn primary"
                              onClick={() => openReception(item.productId)}
                              title="Registrar entrada de mercancía"
                            >
                              📥 Entrada
                            </button>
                            <button
                              type="button"
                              className="mini-action-btn"
                              onClick={() => openCount(item.productId)}
                              title="Conciliar conteo físico"
                            >
                              📝 Conteo
                            </button>
                            <button
                              type="button"
                              className="mini-action-btn"
                              disabled={historyLoading}
                              onClick={() => openHistory(item.productId, item.productName)}
                              title="Ver historial de movimientos"
                            >
                              📜 Historial
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal: Registrar Entrada / Recepción */}
      {isReceptionModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reception-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '520px' }}>
            <div className="admin-modal-header">
              <h3 id="reception-modal-title">📥 Registrar Entrada de Inventario</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsReceptionModalOpen(false)}>
                &times;
              </button>
            </div>

            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}

            <form onSubmit={submitReception}>
              <div className="admin-form-group form-group">
                <label htmlFor="modal-reception-product">Planta o Producto *</label>
                <select
                  id="modal-reception-product"
                  name="productId"
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={saving}
                >
                  {inventory.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group form-group">
                <label htmlFor="modal-reception-qty">Cantidad Recibida *</label>
                <input
                  id="modal-reception-qty"
                  name="quantity"
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  required
                  autoFocus
                  disabled={saving}
                  placeholder="Ej. 15"
                />
              </div>

              <div className="admin-form-group form-group">
                <label htmlFor="modal-reception-notes">Notas / Remisión (opcional)</label>
                <textarea
                  id="modal-reception-notes"
                  name="notes"
                  maxLength={240}
                  rows={2}
                  disabled={saving}
                  placeholder="Ej. Llegó lote nuevo de vivero central..."
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsReceptionModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={saving}>
                  {saving ? 'Registrando…' : 'Confirmar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Conciliar Conteo Físico */}
      {isCountModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="count-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '520px' }}>
            <div className="admin-modal-header">
              <h3 id="count-modal-title">📝 Conciliar Conteo Físico</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsCountModalOpen(false)}>
                &times;
              </button>
            </div>

            <p className="real-data-copy" style={{ margin: '0.5rem 0 1rem' }}>
              El sistema calculará y guardará la diferencia auditada como un ajuste en la base de datos.
            </p>

            {mutationError && <div className="admin-dialog-error" role="alert">{mutationError}</div>}

            <form onSubmit={submitCount}>
              <div className="admin-form-group form-group">
                <label htmlFor="modal-count-product">Planta o Producto *</label>
                <select
                  id="modal-count-product"
                  name="productId"
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={saving}
                >
                  {inventory.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group form-group">
                <label htmlFor="modal-count-qty">Existencia Física Contada *</label>
                <input
                  id="modal-count-qty"
                  name="countedQuantity"
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  required
                  autoFocus
                  disabled={saving}
                  placeholder="Ej. 20"
                />
              </div>

              <div className="admin-form-group form-group">
                <label htmlFor="modal-count-reason">Motivo del Ajuste / Conteo *</label>
                <textarea
                  id="modal-count-reason"
                  name="reason"
                  minLength={3}
                  maxLength={240}
                  rows={2}
                  required
                  disabled={saving}
                  placeholder="Ej. Conteo físico de fin de mes / Merma detectada"
                />
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsCountModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={saving}>
                  {saving ? 'Guardando…' : 'Conciliar Saldo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Historial de Movimientos */}
      {historyLoading && (
        <div className="cashier-status-container" role="status">
          <div className="loading-spinner" />
          <p>Cargando historial de movimientos…</p>
        </div>
      )}

      {history && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '750px' }}>
            <div className="admin-modal-header">
              <h3 id="history-modal-title">📜 Historial · {history.productName}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setHistory(null)}>
                &times;
              </button>
            </div>

            {history.items.length === 0 ? (
              <p className="no-records-copy" style={{ margin: '1.5rem 0' }}>
                No hay movimientos registrados para esta planta en esta sucursal.
              </p>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="db-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Motivo / Notas</th>
                      <th>Registró</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.createdAt).toLocaleString('es-MX')}</td>
                        <td>
                          <strong>{movementLabel(item.movementType)}</strong>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 'bold',
                              color: item.quantity > 0 ? 'hsl(145, 70%, 35%)' : 'hsl(0, 85%, 45%)',
                            }}
                          >
                            {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
                          </span>
                        </td>
                        <td>{item.notes ?? '—'}</td>
                        <td>{item.createdByLabel ?? 'Personal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {history.hasMore && (
              <p className="real-data-copy" style={{ marginTop: '0.75rem' }}>
                Se muestran los 50 movimientos más recientes.
              </p>
            )}

            <div className="admin-modal-footer">
              <button type="button" className="retry-btn-secondary" onClick={() => setHistory(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function movementLabel(value: string): string {
  if (value === 'RECEPTION') return '📥 Recepción / Entrada'
  if (value === 'ADJUSTMENT_ADD') return '➕ Ajuste (Sobrante)'
  if (value === 'ADJUSTMENT_SUB') return '➖ Ajuste (Merma/Faltante)'
  if (value === 'SALE') return '🛒 Venta en Caja'
  return '📦 Movimiento'
}
