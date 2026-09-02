import { NavLink } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { useDemoStore } from '../../app/providers/DemoStore'
import { usePublicCart } from '../../features/public-orders/PublicCartProvider'

export function SiteHeader({ onOpenCart }: { onOpenCart: () => void }) {
  const { darkTheme, toggleTheme } = useDemoStore()
  const { itemCount } = usePublicCart()
  return (
    <header>
      <div className="nav-container">
        <NavLink to="/" className="logo" aria-label="Vivero Dulcinea, inicio"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></NavLink>
        <nav aria-label="Navegación principal"><ul>
          <li><NavLink to="/catalogo">Catálogo</NavLink></li>
          <li><NavLink to="/#care-quiz">Guía de Cuidado</NavLink></li>
          <li><NavLink to="/#care-chat">Asistente</NavLink></li>
        </ul></nav>
        <div className="nav-actions">
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label={darkTheme ? 'Usar tema claro' : 'Usar tema oscuro'}>{darkTheme ? '☀' : '☾'}</button>
          <button className="cart-toggle-btn" onClick={onOpenCart} aria-label={`Ver carrito, ${itemCount} artículos`}>🛒<span className="cart-count">{itemCount}</span></button>
          <NavLink className="admin-toggle-btn" to="/login" aria-label="Acceso a demostraciones internas">🔐</NavLink>
        </div>
      </div>
    </header>
  )
}
