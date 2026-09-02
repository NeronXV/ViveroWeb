import { useEffect, useMemo, useState } from 'react'
import { formatPriceCents } from '../public-catalog/CatalogProductCard'
import { loadAdminWebOrders, setAdminWebOrderStatus, WebOrderServiceError } from '../public-orders/web-order-service'
import type { AdminWebOrder, WebOrderStatus } from '../public-orders/web-order-types'

const STATUS_LABELS: Record<WebOrderStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  READY: 'Listo para recoger',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
}

const NEXT_STATUSES: Record<WebOrderStatus, WebOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function AdminOrders({ active }: { active: boolean }) {
  const [orders, setOrders] = useState<AdminWebOrder[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<AdminWebOrder | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setStatus('loading')
    setError('')
    loadAdminWebOrders(controller.signal).then((response) => {
      setOrders(response.items)
      setStatus('ready')
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar los pedidos.')
      setStatus('error')
    })
    return () => controller.abort()
  }, [active, refreshKey])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return orders
    return orders.filter((order) => order.orderNumber.toLowerCase().includes(query)
      || order.customer.name.toLowerCase().includes(query)
      || order.items.some((item) => item.name.toLowerCase().includes(query)))
  }, [orders, search])

  const pendingCount = orders.filter((order) => order.status === 'PENDING').length
  const activeTotalCents = orders.filter((order) => order.status !== 'CANCELLED').reduce((sum, order) => sum + order.totalCents, 0)
  const itemCount = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)

  const changeStatus = async (order: AdminWebOrder, nextStatus: WebOrderStatus) => {
    if (updatingId) return
    setUpdatingId(order.id)
    setError('')
    try {
      const result = await setAdminWebOrderStatus(order.id, nextStatus)
      setOrders((current) => current.map((candidate) => candidate.id === order.id
        ? { ...candidate, status: result.status, updatedAt: result.updatedAt }
        : candidate))
      setSelectedOrder((current) => current?.id === order.id
        ? { ...current, status: result.status, updatedAt: result.updatedAt }
        : current)
    } catch (reason) {
      setError(reason instanceof WebOrderServiceError ? reason.message : 'No fue posible actualizar el pedido.')
    } finally {
      setUpdatingId(null)
    }
  }

  if (!active) return null

  return <section className="db-tab-content active" aria-labelledby="orders-title" aria-busy={status === 'loading'}>
    <div className="section-header-row"><div><h3 id="orders-title" style={{ margin: 0 }}>🧾 Pedidos reales de la tienda web</h3><p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Solicitudes persistidas en Supabase con precios confirmados por el servidor.</p></div><button type="button" className="retry-btn-secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={status === 'loading'}>Actualizar</button></div>

    <div className="stock-kpi-bar" style={{ marginTop: '1rem' }}>
      <div className="stock-kpi-card"><div className="stock-kpi-icon">📦</div><div className="stock-kpi-info"><span className="stock-kpi-value">{orders.length}</span><span className="stock-kpi-label">Pedidos recibidos</span></div></div>
      <div className="stock-kpi-card"><div className="stock-kpi-icon">⏳</div><div className="stock-kpi-info"><span className="stock-kpi-value">{pendingCount}</span><span className="stock-kpi-label">Por confirmar</span></div></div>
      <div className="stock-kpi-card"><div className="stock-kpi-icon">🌿</div><div className="stock-kpi-info"><span className="stock-kpi-value">{itemCount}</span><span className="stock-kpi-label">Artículos solicitados</span></div></div>
      <div className="stock-kpi-card"><div className="stock-kpi-icon">💰</div><div className="stock-kpi-info"><span className="stock-kpi-value">{formatPriceCents(activeTotalCents)}</span><span className="stock-kpi-label">Valor no cancelado</span></div></div>
    </div>

    <div className="stock-filter-toolbar" style={{ marginTop: '1rem' }}><div className="stock-search-box" style={{ maxWidth: '420px' }}><span className="stock-search-icon">🔍</span><input type="search" placeholder="Buscar por folio, cliente o producto" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" className="stock-search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">✕</button>}</div></div>

    {error && <div className="admin-page-error" role="alert">{error}</div>}
    {status === 'loading' && <p role="status">Cargando pedidos reales…</p>}
    {status === 'error' && <button type="button" className="catalog-action" onClick={() => setRefreshKey((value) => value + 1)}>Reintentar</button>}

    {status === 'ready' && filteredOrders.length === 0 && <div className="promo-empty-card" style={{ marginTop: '1.25rem' }}><div className="promo-empty-icon">🧾</div><div><h4>{search ? 'No hay coincidencias' : 'Aún no hay pedidos web'}</h4><p>{search ? 'Prueba con otro término.' : 'Los pedidos enviados desde el catálogo público aparecerán aquí.'}</p></div></div>}

    {filteredOrders.length > 0 && <div className="botanical-section-card" style={{ marginTop: '1.25rem' }}><div className="table-responsive"><table className="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Sucursal</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{order.customer.name}</td><td>{order.branch.name}</td><td>{new Date(order.createdAt).toLocaleString('es-MX')}</td><td><strong>{formatPriceCents(order.totalCents)}</strong></td><td><span className={`web-order-status status-${order.status.toLowerCase()}`}>{STATUS_LABELS[order.status]}</span></td><td><button type="button" className="mini-action-btn primary" onClick={() => setSelectedOrder(order)}>Ver detalle</button></td></tr>)}</tbody></table></div></div>}

    {selectedOrder && <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="order-detail-title"><div className="admin-modal-content" style={{ maxWidth: '620px' }}><div className="admin-modal-header"><h3 id="order-detail-title">{selectedOrder.orderNumber}</h3><button type="button" className="admin-modal-close" onClick={() => setSelectedOrder(null)} aria-label="Cerrar detalle">×</button></div>
      <div className="web-order-admin-detail">
        <p><strong>Cliente:</strong> {selectedOrder.customer.name}</p>
        <p><strong>Contacto:</strong> {[selectedOrder.customer.phone, selectedOrder.customer.email].filter(Boolean).join(' · ')}</p>
        <p><strong>Sucursal:</strong> {selectedOrder.branch.name} ({selectedOrder.branch.code})</p>
        {selectedOrder.notes && <p><strong>Notas:</strong> {selectedOrder.notes}</p>}
        <div className="botanical-section-card">{selectedOrder.items.map((item) => <div className="web-order-admin-item" key={item.productId}><div><strong>{item.name}</strong><small>{item.code} · {item.quantity} × {formatPriceCents(item.unitPriceCents)}</small>{item.promotionName && <small>Promoción: {item.promotionName}</small>}</div><strong>{formatPriceCents(item.lineTotalCents)}</strong></div>)}</div>
        {selectedOrder.discountCents > 0 && <p><strong>Descuento:</strong> −{formatPriceCents(selectedOrder.discountCents)}</p>}
        <div className="cart-total-row"><span>Total confirmado:</span><span>{formatPriceCents(selectedOrder.totalCents)}</span></div>
        {NEXT_STATUSES[selectedOrder.status].length > 0 && <div className="admin-modal-footer">{NEXT_STATUSES[selectedOrder.status].map((nextStatus) => <button type="button" key={nextStatus} className={nextStatus === 'CANCELLED' ? 'retry-btn-secondary' : 'catalog-action'} disabled={updatingId === selectedOrder.id} onClick={() => changeStatus(selectedOrder, nextStatus)}>{updatingId === selectedOrder.id ? 'Guardando…' : STATUS_LABELS[nextStatus]}</button>)}</div>}
      </div>
    </div></div>}
  </section>
}
