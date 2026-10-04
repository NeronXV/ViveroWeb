import { createBackendCatalogService } from './backend-catalog-service'
import type { PublicCatalogQuery } from './catalog-query'
import type { PublicCatalogCategory, PublicCatalogResponse } from './catalog-types'

export class PublicCatalogLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicCatalogLoadError'
  }
}

export async function loadPublicCatalog(
  query: PublicCatalogQuery,
  callerSignal?: AbortSignal,
): Promise<PublicCatalogResponse> {
  const service = createBackendCatalogService()
  try {
    const id = (value: string) => {
      if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 4294967295) throw new PublicCatalogLoadError('Identificador de catálogo no válido.')
      return Number(value)
    }
    const categories: PublicCatalogCategory[] = []
    let afterId: number | undefined
    do {
      const page = await service.categories({ limit: 100, afterId }, callerSignal)
      categories.push(...page.items.map(c => ({ id: String(c.id), name: c.name })))
      afterId = page.next_after_id ?? undefined
    } while (afterId !== undefined)
    const page = await service.products({ limit: query.limit ?? 24, search: query.search,
      ...(query.categoryId ? { categoryId: id(query.categoryId) } : {}),
      ...(query.cursor ? { afterId: id(query.cursor.id) } : {}) }, callerSignal)
    return { schemaVersion: 3, categories, items: page.items.map(p => {
      const category = categories.find(c => c.id === String(p.category_id))
      if (!category) throw new PublicCatalogLoadError('La categoría del producto no está disponible. Actualiza el catálogo.')
      return { id: String(p.id), name: p.common_name, scientificName: p.scientific_name, description: p.description, category,
        price: { amountCents: p.effective_price_cents, originalAmountCents: p.active_promotion ? p.price_cents : null,
          discountPercent: p.active_promotion?.discount_percent ?? null, currency: 'MXN' as const, unit: p.unit },
        care: { wateringAdvice: p.watering_advice, lightType: p.light_type, recommendedClimate: p.recommended_climate },
        image: p.image ? { authority: 'backend-api' as const, url: p.image.url, altText: p.image.alt_text } : null,
        activePromotion: p.active_promotion ? { id: String(p.active_promotion.id), name: p.active_promotion.name } : null,
        publicationStatus: 'LISTED' as const }
    }), page: { limit: query.limit ?? 24, hasMore: page.next_after_id !== null,
      nextCursor: page.next_after_id === null ? null : { id: String(page.next_after_id), sortName: 'id' } } }
  } catch (error) {
    if (callerSignal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError')
    if (error instanceof PublicCatalogLoadError) throw error
    throw new PublicCatalogLoadError('No fue posible cargar el catálogo.')
  }
}
