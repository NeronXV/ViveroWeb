import type { CashierSaleDetailResponse } from './cashier-types'
import { formatCents } from './cashier-money'
import { cashierOriginLabel } from './cashier-desk-state'
export function CashierSaleSummary({ detail }: { detail: CashierSaleDetailResponse }) {
  return <section className="desk-card desk-sale-summary" aria-labelledby="desk-products-title">
    <p className="desk-eyebrow">{cashierOriginLabel(detail.sale.origin)}</p>
    <h2 id="desk-products-title">{detail.sale.folio}</h2>
    <p className="desk-muted">Productos de la venta · precios confirmados</p>
    <ul className="desk-items">{detail.items.map(item => <li key={item.id}>
      <div><strong>{item.productName}</strong><p>{item.quantity} × ${formatCents(item.unitPriceCents)}</p></div>
      <b>${formatCents(item.lineTotalCents)}</b>
    </li>)}</ul>
    <div className="desk-total"><span>Total</span><strong>${formatCents(detail.sale.totalCents)} <small>MXN</small></strong></div>
  </section>
}
