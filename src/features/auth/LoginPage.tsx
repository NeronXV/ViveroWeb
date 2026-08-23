import { Link } from 'react-router-dom'
import { DemoBanner } from '../../components/feedback/DemoBanner'
import logo from '../../assets/isotipo-flor.svg'

export function LoginPage() {
  return <main className="internal-page auth-page"><section className="login-card" aria-labelledby="login-title"><Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link><DemoBanner /><h1 id="login-title">Selecciona una vista interna</h1><p>No existe autenticación real en esta fase. Estos accesos abren experiencias locales de demostración y no conceden permisos.</p><div className="role-grid"><Link className="demo-btn admin-role-btn" to="/admin"><strong>Administración</strong><span>Editorial, productos, inventario y promociones demo</span></Link><Link className="demo-btn manager-role-btn" to="/admin?tab=ventas"><strong>Gerencia</strong><span>Ventas, pedidos y personal con datos de demostración</span></Link><Link className="demo-btn cashier-role-btn" to="/caja"><strong>Caja web</strong><span>Flujo de venta local sin pagos reales</span></Link></div><Link className="back-link" to="/">← Volver al sitio público</Link></section></main>
}
