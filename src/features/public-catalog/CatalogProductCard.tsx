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
  const hasDiscount = product.activePromotion !== null || (product.price.discountPercent !== null && product.price.discountPercent > 0)
  const showOriginalPrice = hasDiscount && product.price.originalAmountCents !== null && product.price.originalAmountCents > product.price.amountCents

  return (
    <article className="plant-card">
      <div className={`plant-image-container ${catalogImageUrl ? '' : 'plant-image-fallback'}`}>
        <img src={imageSource} alt={imageAlt} loading="lazy" onError={() => catalogImageUrl && setFailedImageUrl(catalogImageUrl)} />
        <span className="plant-tag">{product.category.name}</span>
        {hasDiscount && (
          <span
            style={{
              position: 'absolute',
              top: '0.75rem',
              right: '0.75rem',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.8rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '20px',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
              zIndex: 2,
            }}
          >
            🔥 {product.price.discountPercent ? `${product.price.discountPercent}% OFF` : 'OFERTA'}
          </span>
        )}
      </div>
      <div className="plant-info">
        <h3 className="plant-title">{product.name}</h3>
        {product.scientificName && <p className="plant-scientific-name"><i>{product.scientificName}</i></p>}
        {product.activePromotion && (
          <p style={{ margin: '0.15rem 0 0.4rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
            🏷️ {product.activePromotion.name}
          </p>
        )}
        <p className="plant-description">{product.description}</p>
        <div className="plant-meta" aria-label="Cuidados recomendados">
          {product.care.lightType && <span>☀ {product.care.lightType}</span>}
          {product.care.wateringAdvice && <span>💧 {product.care.wateringAdvice}</span>}
          {product.care.recommendedClimate && <span>◉ {product.care.recommendedClimate}</span>}
        </div>
        <div className="plant-purchase">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {showOriginalPrice && (
              <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {formatPriceCents(product.price.originalAmountCents!)}
              </span>
            )}
            <span className="plant-price" style={hasDiscount ? { color: '#10b981', fontWeight: 700 } : undefined}>
              {formatPriceCents(product.price.amountCents)}{' '}
              <small>{product.price.currency} / {product.price.unit}</small>
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
