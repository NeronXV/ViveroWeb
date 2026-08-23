import { useState } from 'react'
import { useDemoStore } from '../../app/providers/DemoStore'

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cart, plants, cartTotal, changeQuantity, removeFromCart, checkoutDemo } = useDemoStore()
  const [notice, setNotice] = useState('')
  const finish = () => { const order = checkoutDemo(); if (order) { setNotice(`Pedido ${order.id} registrado únicamente como demostración.`); } }
  return <><button className={`cart-overlay ${open ? 'open' : ''}`} onClick={onClose} aria-label="Cerrar carrito" tabIndex={open ? 0 : -1} /><aside className={`cart-panel ${open ? 'open' : ''}`} aria-hidden={!open} aria-labelledby="cart-title">
    <div className="cart-header"><h3 id="cart-title">Tu Carrito</h3><button className="close-cart-btn" onClick={onClose} aria-label="Cerrar carrito">×</button></div>
    <div className="cart-items">{cart.length === 0 && <div className="cart-empty-msg">Tu carrito está vacío. ¡Explora nuestro catálogo!</div>}{cart.map((item) => { const plant = plants.find(({ id }) => id === item.plantId); if (!plant) return null; const price = plant.price * (1 - plant.discount / 100); return <div className="cart-item" key={item.plantId}><img src={plant.image} alt="" className="cart-item-img" /><div className="cart-item-details"><h4>{plant.name}</h4><div className="cart-item-price">${price.toFixed(2)}</div><div className="cart-item-qty"><button className="qty-btn" onClick={() => changeQuantity(item.plantId, -1)} aria-label={`Quitar una unidad de ${plant.name}`}>−</button><span aria-label={`${item.quantity} unidades`}>{item.quantity}</span><button className="qty-btn" onClick={() => changeQuantity(item.plantId, 1)} aria-label={`Agregar una unidad de ${plant.name}`}>+</button></div></div><button className="remove-item-btn" onClick={() => removeFromCart(item.plantId)} aria-label={`Eliminar ${plant.name}`}>🗑</button></div>})}</div>
    <div className="cart-footer"><div className="cart-total-row"><span>Total:</span><span>${cartTotal.toFixed(2)}</span></div><p className="demo-copy">Checkout simulado. No se solicitarán datos personales ni pago.</p><button className="checkout-btn" onClick={finish} disabled={cart.length === 0}>Finalizar pedido demo</button><p className="form-notice" aria-live="polite">{notice}</p></div>
  </aside></>
}
