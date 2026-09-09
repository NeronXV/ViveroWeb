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
      <fieldset className="care-light-options">
        <legend>¿Cuánta luz recibe tu espacio?</legend>
        <div className="quiz-options">
          {[['sun', '☀', 'Sol directo', 'Un rincón que recibe los rayos del sol'],
            ['indirect', '◐', 'Luz indirecta', 'Claridad sin sol directo o semisombra'],
            ['shade', '❧', 'Sombra', 'Un espacio protegido del sol']].map(([value, icon, title, description]) =>
            <label className={'quiz-option care-light-choice' + (light === value ? ' selected' : '')} key={value}>
              <input type="radio" name="care-light" value={value} checked={light === value} onChange={() => { setLight(value); setDone(false) }} />
              <span className="care-option-icon" aria-hidden="true">{icon}</span>
              <strong>{title}</strong><small>{description}</small>
            </label>)}
        </div>
      </fieldset>
      <div className="care-climate-field">
        <label htmlFor="care-climate">¿Cómo es el clima de tu zona?</label>
        <select id="care-climate" value={climate} onChange={(event) => { setClimate(event.target.value); setDone(false) }}>
          <option value="any">Ver todos los climas</option><option value="calido">Cálido</option><option value="templado">Templado</option><option value="seco">Seco</option>
        </select>
      </div>
      {catalog.status === 'loading' && <p role="status">Consultando plantas…</p>}
      {catalog.status === 'error' && <p role="alert">No pudimos consultar el catálogo. <button onClick={catalog.retry}>Reintentar</button></p>}
      <button className="quiz-btn quiz-btn-primary" disabled={catalog.status !== 'ready'} onClick={() => setDone(true)}>Ver recomendaciones</button>
    </div>
    {done && <div className="care-results"><h3>Tus recomendaciones</h3><div className="catalog-grid">{matches.length ? matches.map((product) =>
      <CatalogProductCard key={product.id} product={product} onAdd={addProduct} />) :
      <p role="status">No encontramos plantas con esa combinación. Prueba otra luz o selecciona todos los climas; también podemos orientarte en el vivero.</p>}</div></div>}
  </div></section>
}
