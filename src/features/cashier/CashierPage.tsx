import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle, useHeadingFocus } from '../../app/usePageAccessibility'
import { useDemoStore } from '../../app/providers/DemoStore'
import { DemoBanner } from '../../components/feedback/DemoBanner'

export function CashierPage() {
  const { plants, cart, cartCount, cartTotal, addToCart, changeQuantity, checkoutDemo } = useDemoStore()
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const headingRef = useHeadingFocus<HTMLHeadingElement>('cashier')
  useDocumentTitle('Caja')
  const results = useMemo(() => plants.filter((plant) => plant.name.toLowerCase().includes(query.toLowerCase())), [plants, query])
  const finish = () => { const order = checkoutDemo(); setNotice(order ? `Venta ${order.id} registrada localmente como demostración.` : 'Agrega al menos un producto.') }
  return <main className="internal-page"><div className="internal-shell"><div className="internal-topbar"><div><p className="eyebrow">Vivero Dulcinea</p><h1 ref={headingRef} tabIndex={-1}>Caja web</h1></div><div><DemoBanner compact /><Link className="back-link" to="/">Salir</Link></div></div><div className="cashier-layout"><section className="cashier-products" aria-labelledby="cashier-products-title"><h2 id="cashier-products-title">Productos</h2><label htmlFor="cashier-search">Buscar producto</label><input id="cashier-search" className="internal-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre de la planta" /><div className="cashier-product-grid">{results.map((plant) => <article key={plant.id} className="cashier-product"><img src={plant.image} alt="" /><div><h3>{plant.name}</h3><p>${(plant.price * (1 - plant.discount / 100)).toFixed(2)} · {plant.stock} en stock</p></div><button onClick={() => addToCart(plant.id)} disabled={plant.stock === 0}>Agregar</button></article>)}</div></section><aside className="cashier-ticket" aria-labelledby="ticket-title"><h2 id="ticket-title">Ticket demo</h2><p>{cartCount} artículos</p>{cart.map((item) => { const plant = plants.find(({ id }) => id === item.plantId); return plant ? <div className="ticket-row" key={item.plantId}><span>{plant.name}</span><div><button onClick={() => changeQuantity(item.plantId, -1)} aria-label={`Quitar ${plant.name}`}>−</button><strong>{item.quantity}</strong><button onClick={() => changeQuantity(item.plantId, 1)} aria-label={`Agregar ${plant.name}`}>+</button></div></div> : null })}<div className="ticket-total"><span>Total</span><strong>${cartTotal.toFixed(2)}</strong></div><button className="checkout-btn" onClick={finish}>Completar venta demo</button><p className="form-notice" aria-live="polite">{notice}</p></aside></div></div></main>
}
