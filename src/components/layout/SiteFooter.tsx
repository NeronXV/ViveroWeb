import { Link } from 'react-router-dom'
import logo from '../../assets/isotipo-flor.svg'
import { useState, type FormEvent } from 'react'

export function SiteFooter() {
  const [notice, setNotice] = useState('')
  const subscribe = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setNotice('Gracias. Registro simulado; no se envió información.') }
  return <footer><div className="footer-container">
    <div className="footer-brand"><Link to="/" className="logo"><img src={logo} alt="" className="logo-icon" />Vivero<span>Dulcinea</span></Link><p>Expertos cultivadores dedicados a esparcir el amor por la naturaleza en hogares y oficinas con estilo.</p></div>
    <div className="footer-links"><h5>Explorar</h5><ul><li><Link to="/catalogo">Colecciones</Link></li><li><Link to="/#care-quiz">Guía interactiva</Link></li><li><Link to="/login">Acceso interno demo</Link></li></ul></div>
    <div className="footer-links"><h5>Demostraciones</h5><ul><li><Link to="/caja">Caja web</Link></li><li><Link to="/admin">Administración</Link></li><li><a href="mailto:demo@example.invalid">Contacto no habilitado</a></li></ul></div>
    <div className="footer-newsletter"><h5>Boletín Verde</h5><p>Formulario demostrativo sin conexión externa.</p><form className="newsletter-form" onSubmit={subscribe}><label className="sr-only" htmlFor="newsletter-email">Correo electrónico</label><input id="newsletter-email" type="email" placeholder="tu@email.com" required /><button type="submit">→</button></form><p className="form-notice" aria-live="polite">{notice}</p></div>
  </div><div className="footer-bottom"><p>© 2026 Vivero Dulcinea. Prototipo demostrativo.</p></div></footer>
}
