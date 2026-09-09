import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDemoStore } from '../../app/providers/DemoStore'
import { heroImage } from '../../data/mock/plants'
import { CareChat } from './CareChat'
import { CareQuiz } from './CareQuiz'
import { CatalogSection } from './CatalogSection'

export function HomePage() {
  const { editorial } = useDemoStore()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(() => (searchParams.get('q') ?? '').slice(0, 80))

  const search = (event: FormEvent) => {
    event.preventDefault()
    const target = document.getElementById('catalogo')
    target?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <main>
      <section className="hero" id="home">
        <div className="hero-container">
          <div className="hero-text">
            <div className="hero-badge">◉ {editorial.announcement}</div>
            <h1>{editorial.title}</h1>
            <p>{editorial.description}</p>
            <form className="search-bar" onSubmit={search}>
              <label className="sr-only" htmlFor="home-search">Buscar plantas</label>
              <input
                id="home-search"
                value={query}
                maxLength={80}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca tu planta favorita (ej. Monstera, Suculenta)…"
              />
              <button aria-label="Realizar búsqueda">⌕</button>
            </form>
          </div>
          <div className="hero-image-wrapper">
            <img src={heroImage} alt="Invernadero moderno con abundantes plantas verdes" className="hero-img" />
          </div>
        </div>
      </section>
      <CatalogSection
        showSearch
        searchQuery={query}
        onSearchChange={setQuery}
      />
      <CareQuiz />
      <CareChat />
    </main>
  )
}
