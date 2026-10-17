import type { CashierSale } from './cashier-types'
import { formatCents } from './cashier-money'
import { cashierClaimLabel, cashierOriginLabel } from './cashier-desk-state'

export function CashierPendingList({ sales, locked, onCharge, onDetail, compact = false, selectedId }: {
  sales: CashierSale[]; locked: boolean; onCharge: (id: string) => void; onDetail: (id: string) => void
  compact?: boolean; selectedId?: string | null
}) {
  if (compact) return <ul className="desk-sales pos-pending-list" aria-label="Ventas pendientes">{sales.map(sale => <li key={sale.id}>
    <button type="button" className="pos-pending-row" aria-label={`Ver detalle ${sale.folio}`} aria-pressed={selectedId === sale.id} disabled={locked} onClick={() => onDetail(sale.id)}>
      <span className="pos-row-top"><strong>{sale.folio}</strong><b>${formatCents(sale.totalCents)}</b></span>
      <span className="pos-row-origin">{cashierOriginLabel(sale.origin)} · {sale.itemCount} {sale.itemCount === 1 ? 'producto' : 'productos'}</span>
      <span className="pos-row-bottom"><span className={`desk-state ${sale.claimState === 'AVAILABLE' ? '' : 'desk-state-attention'}`}>{cashierClaimLabel(sale.claimState)}</span>
        <span className="pos-row-detail">Abrir pedido <span aria-hidden="true">→</span></span></span>
    </button>
  </li>)}</ul>
  return <ul className="desk-sales" aria-label="Ventas pendientes">{sales.map(sale => <li key={sale.id}>
    <article className="desk-sale" aria-label={`Venta ${sale.folio}`}>
      <div className="desk-sale-identity"><span className="desk-sale-icon" aria-hidden="true">{sale.origin === 'WEB_ORDER' ? '↗' : '❧'}</span>
        <div><h3>{sale.folio}</h3><p>{cashierOriginLabel(sale.origin)} · {sale.itemCount} {sale.itemCount === 1 ? 'producto' : 'productos'}</p>
          <small>{sale.createdByLabel ?? 'Venta en sucursal'} · {new Date(sale.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</small></div></div>
      <span className={`desk-state ${sale.claimState === 'AVAILABLE' ? '' : 'desk-state-attention'}`}>{cashierClaimLabel(sale.claimState)}</span>
      <strong className="desk-sale-total">${formatCents(sale.totalCents)}<small>MXN</small></strong>
      <div className="desk-sale-actions">
        <button className="desk-primary" type="button" disabled={locked || sale.claimState === 'CLAIMED_BY_OTHER'} onClick={() => onCharge(sale.id)}>Cobrar venta</button>
        <button className="desk-secondary" type="button" disabled={locked} onClick={() => onDetail(sale.id)}>Ver detalle</button>
      </div>
    </article>
  </li>)}</ul>
}
