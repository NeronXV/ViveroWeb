import { useState } from 'react'
import { useCareCatalog } from './useCareCatalog'
import { recommendPlants } from './care-catalog'
import { CatalogProductCard } from './CatalogProductCard'
import { usePublicCart } from '../public-orders/PublicCartProvider'

export function CareQuiz() {
  const catalog = useCareCatalog()
  const { addProduct } = usePublicCart()
  const [light, setLight] = useState('indirect')
  const [climate, setClimate] = useState('any')
  const [done, setDone] = useState(false)
  const matches = recommendPlants(catalog.products, light, climate)
  return <section className="quiz-section" id="care-quiz" aria-labelledby="quiz-title"><div className="quiz-container">
    <h2 id="quiz-title">Encuentra una planta para tu espacio</h2>
    <p>Recomendaciones según los cuidados registrados en nuestro catálogo actual.</p>
    <div className="quiz-card">
      <label>Luz del espacio<select value={light} onChange={(event) => { setLight(event.target.value); setDone(false) }}>
        <option value="sun">Sol directo</option><option value="indirect">Luz indirecta o semisombra</option><option value="shade">Sombra</option>
      </select></label>
      <label>Clima<select value={climate} onChange={(event) => { setClimate(event.target.value); setDone(false) }}>
        <option value="any">Cualquiera</option><option value="calido">Cálido</option><option value="templado">Templado</option><option value="seco">Seco</option>
      </select></label>
      {catalog.status === 'loading' && <p role="status">Consultando plantas…</p>}
      {catalog.status === 'error' && <p role="alert">No pudimos consultar el catálogo. <button onClick={catalog.retry}>Reintentar</button></p>}
      <button className="quiz-btn quiz-btn-primary" disabled={catalog.status !== 'ready'} onClick={() => setDone(true)}>Ver recomendaciones</button>
    </div>
    {done && <div className="catalog-grid">{matches.length ? matches.map((product) =>
      <CatalogProductCard key={product.id} product={product} onAdd={addProduct} />) :
      <p role="status">No hay coincidencias con cuidados registrados para esa combinación. Consulta al vivero; no sustituimos la búsqueda con productos de ejemplo.</p>}</div>}
  </div></section>
}
