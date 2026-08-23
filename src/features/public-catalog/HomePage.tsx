import { useNavigate } from 'react-router-dom'
import { useState, type FormEvent } from 'react'
import { useDemoStore } from '../../app/providers/DemoStore'
import { heroImage } from '../../data/mock/plants'
import { CareChat } from './CareChat'
import { CareQuiz } from './CareQuiz'
import { CatalogSection } from './CatalogSection'

export function HomePage() {
  const { editorial } = useDemoStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const search = (event: FormEvent) => { event.preventDefault(); navigate(`/catalogo?q=${encodeURIComponent(query)}`) }
  return <main><section className="hero" id="home"><div className="hero-container"><div className="hero-text"><div className="hero-badge">◉ {editorial.announcement}</div><h1>{editorial.title}</h1><p>{editorial.description}</p><form className="search-bar" onSubmit={search}><label className="sr-only" htmlFor="home-search">Buscar plantas</label><input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca tu planta favorita (ej. Monstera, Suculenta)…" /><button aria-label="Realizar búsqueda">⌕</button></form></div><div className="hero-image-wrapper"><img src={heroImage} alt="Invernadero moderno con abundantes plantas verdes" className="hero-img" /></div></div></section><CatalogSection /><CareQuiz /><CareChat /></main>
}
