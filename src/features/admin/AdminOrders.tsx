import { useMemo, useState } from 'react'
import { useDemoStore } from '../../app/providers/DemoStore'
import type { DemoOrder } from '../../types/domain'

export function AdminOrders({ active }: { active: boolean }) {
  const { orders } = useDemoStore()
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<DemoOrder | null>(null)

  // Filtrado de pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (!search.trim()) return true
      const query = search.trim().toLowerCase()
      const matchId = order.id.toLowerCase().includes(query)
      const matchItems = order.items.some((item) => item.name.toLowerCase().includes(query))
      return matchId || matchItems
    })
  }, [orders, search])

  // KPIs
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, order) => sum + order.total, 0)
  }, [orders])

  const totalItemsSold = useMemo(() => {
    return orders.reduce(
      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0
    )
  }, [orders])

  const averageTicket = useMemo(() => {
    return orders.length > 0 ? totalRevenue / orders.length : 0
  }, [orders, totalRevenue])

  if (!active) return null

  return (
    <section className="db-tab-content active" aria-labelledby="orders-title">
      {/* Header */}
      <div className="section-header-row">
        <div>
          <h3 id="orders-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🧾</span> Gestión y Registro de Pedidos
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Control y seguimiento de órdenes generadas desde la tienda pública.
          </p>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="stock-kpi-bar" style={{ marginTop: '1rem' }}>
        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
            📦
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{orders.length}</span>
            <span className="stock-kpi-label">Total Pedidos</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            💰
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">
              ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="stock-kpi-label">Recaudación Total</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            🌿
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{totalItemsSold}</span>
            <span className="stock-kpi-label">Plantas / Artículos</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
            📈
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">
              ${averageTicket.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="stock-kpi-label">Ticket Promedio</span>
          </div>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="stock-filter-toolbar" style={{ marginTop: '1rem' }}>
        <div className="stock-search-box" style={{ maxWidth: '380px' }}>
          <span className="stock-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por ID de pedido o planta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="stock-search-clear"
              onClick={() => setSearch('')}
            >
              ✕
            </button>
          )}
        </div>

        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Mostrando {filteredOrders.length} de {orders.length} pedidos
        </span>
      </div>

      {/* Tabla de Pedidos en Tarjeta Botánica */}
      {filteredOrders.length > 0 ? (
        <div className="botanical-section-card" style={{ marginTop: '1.25rem' }}>
          <div className="botanical-section-header">
            <span>📋</span>
            <h4>Listado de Órdenes Recientes</h4>
          </div>

          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID Pedido</th>
                  <th>Fecha y Hora</th>
                  <th>Artículos Solicitados</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary-color)' }}>
                      #{order.id.slice(0, 8)}
                    </td>
                    <td>
                      {new Date(order.createdAt).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {order.items.map((item, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'var(--bg-color)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.78rem',
                              border: '1px solid var(--surface-border)',
                            }}
                          >
                            {item.name} <strong style={{ color: 'var(--primary-color)' }}>×{item.quantity}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: '#10b981' }}>
                      ${order.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          display: 'inline-block',
                        }}
                      >
                        🟢 {order.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="mini-action-btn primary"
                        onClick={() => setSelectedOrder(order)}
                      >
                        🔍 Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="promo-empty-card" style={{ marginTop: '1.25rem' }}>
          <div className="promo-empty-icon">🧾</div>
          <div style={{ maxWidth: '460px' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>
              {search ? 'No se encontraron pedidos con esta búsqueda' : 'No hay pedidos registrados por el momento'}
            </h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              {search
                ? 'Intenta con otro término o limpia el buscador para ver todas las órdenes.'
                : 'Cuando los clientes agreguen plantas al carrito y completen su compra en la tienda web, aparecerán aquí con su detalle de artículos y total.'}
            </p>
          </div>
          {search && (
            <button
              type="button"
              className="catalog-action"
              style={{ marginTop: '0.5rem' }}
              onClick={() => setSearch('')}
            >
              Limpiar Búsqueda
            </button>
          )}
        </div>
      )}

      {/* Modal: Detalle de Pedido */}
      {selectedOrder && (
        <div
          className="admin-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
        >
          <div className="admin-modal-content" style={{ maxWidth: '540px' }}>
            <div className="admin-modal-header">
              <h3 id="order-detail-title">
                🧾 Detalle de Pedido #{selectedOrder.id.slice(0, 8)}
              </h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedOrder(null)}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Fecha:</span>
                  <strong>{new Date(selectedOrder.createdAt).toLocaleString('es-MX')}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Estado:</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>🟢 {selectedOrder.status}</span>
                </div>
              </div>

              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>🌿</span>
                  <h4>Artículos Comprados</h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {selectedOrder.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.4rem 0',
                        borderBottom: index < selectedOrder.items.length - 1 ? '1px solid var(--surface-border)' : 'none',
                      }}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          ${item.unitPrice.toFixed(2)} c/u × {item.quantity}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        ${(item.unitPrice * item.quantity).toFixed(2)} MXN
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-color)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid var(--surface-border)',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>Total del Pedido:</span>
                <strong style={{ fontSize: '1.25rem', color: '#10b981' }}>
                  ${selectedOrder.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                </strong>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="catalog-action"
                onClick={() => setSelectedOrder(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
