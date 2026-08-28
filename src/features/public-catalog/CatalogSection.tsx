import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CatalogProductCard } from './CatalogProductCard'
import { usePublicCatalog } from './usePublicCatalog'

export function CatalogSection({ showSearch = false }: { showSearch?: boolean }) {
  const [searchParams] = useSearchParams()
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState(showSearch ? (searchParams.get('q') ?? '').slice(0, 80) : '')
  const deferredQuery = useDeferredValue(query)
  const catalog = usePublicCatalog(deferredQuery, categoryId)
  const hasActiveFilter = deferredQuery.trim() !== '' || categoryId !== null
  return <section className="store" id="catalogo" aria-labelledby="catalog-title"><div className="section-header"><h2 id="catalog-title">Nuestra Colección</h2><p>Filtrado por las categorías más deseadas de la temporada</p></div>
    {showSearch && <div className="catalog-page-search"><label htmlFor="catalog-page-query">Buscar en el catálogo</label><input id="catalog-page-query" type="search" maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Monstera, suculenta…" /></div>}
    <div className="filter-container" aria-label="Filtrar por categoría">
      <button className={`filter-btn ${categoryId === null ? 'active' : ''}`} aria-pressed={categoryId === null} onClick={() => setCategoryId(null)}>Todas</button>
      {catalog.categories.map((category) => <button key={category.id} className={`filter-btn ${categoryId === category.id ? 'active' : ''}`} aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}
    </div>
    <div className="catalog-results" aria-busy={catalog.status === 'loading' || catalog.isLoadingMore}>
      {catalog.status === 'loading' && <div className="catalog-feedback" role="status" aria-live="polite"><p>Cargando catálogo…</p></div>}
      {catalog.status === 'error' && <div className="catalog-feedback catalog-error" role="alert"><p>No pudimos cargar el catálogo. Intenta nuevamente.</p><button className="catalog-action" onClick={catalog.retry}>Reintentar</button></div>}
      {catalog.status === 'ready' && catalog.items.length === 0 && <div className="catalog-feedback empty-state" role="status"><p>{hasActiveFilter ? 'No hay resultados para esta búsqueda o categoría.' : 'El catálogo está vacío por el momento.'}</p></div>}
      {catalog.items.length > 0 && <div className="catalog-grid">{catalog.items.map((product) => <CatalogProductCard key={product.id} product={product} />)}</div>}
      {catalog.status === 'ready' && catalog.items.length > 0 && <div className="catalog-pagination" aria-live="polite">
        {catalog.hasMore && !catalog.pageError && <button className="catalog-action" onClick={catalog.loadMore} disabled={catalog.isLoadingMore}>{catalog.isLoadingMore ? 'Cargando más…' : 'Cargar más'}</button>}
        {catalog.pageError && <><p>No pudimos cargar más productos.</p><button className="catalog-action" onClick={catalog.loadMore}>Reintentar carga</button></>}
        {!catalog.hasMore && <p>Has llegado al final del catálogo.</p>}
      </div>}
    </div>
  </section>
}
