import { useState } from 'react'
import imageFallback from '../../assets/isotipo-flor.svg'
import { resolvePublicCatalogImageUrl } from './catalog-image'
import type { PublicCatalogProduct } from './catalog-types'

const wholeNumberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

export function formatPriceCents(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : ''
  const absoluteCents = Math.abs(amountCents)
  const whole = Math.floor(absoluteCents / 100)
  const cents = absoluteCents % 100
  return `${sign}$${wholeNumberFormatter.format(whole)}.${String(cents).padStart(2, '0')}`
}

export function CatalogProductCard({ product }: { product: PublicCatalogProduct }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const resolvedImageUrl = resolvePublicCatalogImageUrl(product.image)
  const catalogImageUrl = resolvedImageUrl === failedImageUrl ? null : resolvedImageUrl
  const imageSource = catalogImageUrl ?? imageFallback
  const imageAlt = catalogImageUrl ? product.image?.altText ?? product.name : ''
  return <article className="plant-card">
    <div className={`plant-image-container ${catalogImageUrl ? '' : 'plant-image-fallback'}`}>
      <img src={imageSource} alt={imageAlt} loading="lazy" onError={() => catalogImageUrl && setFailedImageUrl(catalogImageUrl)} />
      <span className="plant-tag">{product.category.name}</span>
    </div>
    <div className="plant-info">
      <h3 className="plant-title">{product.name}</h3>
      {product.scientificName && <p className="plant-scientific-name"><i>{product.scientificName}</i></p>}
      <p className="plant-description">{product.description}</p>
      <div className="plant-meta" aria-label="Cuidados recomendados">
        {product.care.lightType && <span>☀ {product.care.lightType}</span>}
        {product.care.wateringAdvice && <span>💧 {product.care.wateringAdvice}</span>}
        {product.care.recommendedClimate && <span>◉ {product.care.recommendedClimate}</span>}
      </div>
      <div className="plant-purchase">
        <span className="plant-price">{formatPriceCents(product.price.amountCents)} <small>{product.price.currency} / {product.price.unit}</small></span>
      </div>
    </div>
  </article>
}
