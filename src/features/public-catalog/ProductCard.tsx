import type { Plant } from '../../types/domain'

export function ProductCard({ plant, onAdd }: { plant: Plant; onAdd: (id: number) => void }) {
  const finalPrice = plant.price * (1 - plant.discount / 100)
  return <article className="plant-card">
    <div className="plant-image-container"><img src={plant.image} alt={plant.name} loading="lazy" /><span className="plant-tag">{plant.category[0].toUpperCase() + plant.category.slice(1)}</span></div>
    <div className="plant-info"><h3 className="plant-title">{plant.name}</h3><div className="plant-meta"><span>☀ {plant.lightDesc}</span><span>💧 {plant.waterDesc}</span><span>{plant.pets ? '🐾 Segura para mascotas' : '⚠ No apta para mascotas'}</span></div>
      <div className="plant-purchase"><span className="plant-price">{plant.discount > 0 && <span className="plant-price-original">${plant.price.toFixed(2)}</span>} ${finalPrice.toFixed(2)} {plant.discount > 0 && <span className="plant-promo-tag">{plant.discount}% OFF</span>}</span><button className="add-to-cart-btn" onClick={() => onAdd(plant.id)} disabled={plant.stock === 0}>{plant.stock === 0 ? 'Agotada' : '🛒 Agregar'}</button></div>
    </div>
  </article>
}
