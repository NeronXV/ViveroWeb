import { Link } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { NewsletterSignup } from '../../features/newsletter/NewsletterSignup'

export function SiteFooter() {
  return <footer><div className="footer-container">
    <div className="footer-brand"><Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link><p>Expertos cultivadores dedicados a esparcir el amor por la naturaleza en hogares y oficinas con estilo.</p></div>
    <div className="footer-links"><h5>Explorar</h5><ul><li><Link to="/catalogo">Colecciones</Link></li><li><Link to="/#care-quiz">Guía interactiva</Link></li></ul></div>
    <NewsletterSignup />
  </div><div className="footer-bottom"><p>© 2026 Vivero Dulcinea. Plantas y cuidados para tu hogar.</p></div></footer>
}
