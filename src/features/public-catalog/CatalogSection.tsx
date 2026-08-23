import { useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useDemoStore } from '../../app/providers/DemoStore'
import type { PlantCategory } from '../../types/domain'
import { ProductCard } from './ProductCard'

type Filter = PlantCategory | 'all'
const filters: Array<{ value: Filter; label: string }> = [{ value: 'all', label: 'Todas' }, { value: 'interior', label: 'Interior' }, { value: 'exterior', label: 'Exterior' }, { value: 'suculentas', label: 'Suculentas' }]

export function CatalogSection({ showSearch = false }: { showSearch?: boolean }) {
  const { plants, addToCart } = useDemoStore()
  const { openCart } = useOutletContext<{ openCart: () => void }>()
  const [searchParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState(showSearch ? searchParams.get('q') ?? '' : '')
  const filtered = useMemo(() => plants.filter((plant) => (filter === 'all' || plant.category === filter) && `${plant.name} ${plant.description}`.toLowerCase().includes(query.toLowerCase().trim())), [filter, plants, query])
  return <section className="store" id="catalogo" aria-labelledby="catalog-title"><div className="section-header"><h2 id="catalog-title">Nuestra Colección</h2><p>Filtrado por las categorías más deseadas de la temporada</p></div>
    {showSearch && <div className="catalog-page-search"><label htmlFor="catalog-page-query">Buscar en el catálogo</label><input id="catalog-page-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Monstera, suculenta…" /></div>}
    <div className="filter-container" aria-label="Filtrar por categoría">{filters.map((item) => <button key={item.value} className={`filter-btn ${filter === item.value ? 'active' : ''}`} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
    <div className="catalog-grid">{filtered.map((plant) => <ProductCard key={plant.id} plant={plant} onAdd={(id) => { addToCart(id); openCart() }} />)}{filtered.length === 0 && <p className="empty-state">No se encontraron plantas que coincidan con la búsqueda.</p>}</div>
  </section>
}
