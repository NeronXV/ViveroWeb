import type { AdminProduct } from '../admin-catalog-types'
import type { AdminInventoryBalance } from '../admin-types'
import type { PlantPreparation } from './plants-service'
import { pesosToCents } from '../admin-catalog-parser'
import type { CatalogingDraft } from './cataloging-service'

export interface PlantFilters { search: string; category: string; pending: boolean; low: boolean }
export function filterCatalogingDrafts(drafts: CatalogingDraft[], filters: PlantFilters): CatalogingDraft[] {
  const query = filters.search.trim().toLocaleLowerCase('es')
  return drafts.filter(d => ['DRAFT', 'REVIEW'].includes(d.status)
    && (!query || [d.original_name, d.fields.approved_name, d.fields.scientific_name, d.fields.internal_code, d.fields.barcode, d.fields.presentation]
      .some(value => value.toLocaleLowerCase('es').includes(query)))
    && (!filters.category || String(d.fields.category_id) === filters.category)
    // Draft quantities are not branch inventory balances.
    && !filters.low)
}
export interface PlantDraft {
  common_name: string; scientific_name: string; description: string; category_id: string
  price: string; wholesale: string; minimum: string; watering_advice: string
  light_type: string; recommended_climate: string; unit: AdminProduct['unit']
}
export function draftFromPlant(p: AdminProduct): PlantDraft {
  return { common_name: p.commonName, scientific_name: p.scientificName ?? '', description: p.description,
    category_id: p.categoryId, price: p.priceCents > 0 ? (p.priceCents / 100).toFixed(2) : '',
    wholesale: p.wholesalePriceCents === null ? '' : (p.wholesalePriceCents / 100).toFixed(2), minimum: String(p.minimumStock),
    watering_advice: p.wateringAdvice, light_type: p.lightType, recommended_climate: p.recommendedClimate, unit: p.unit }
}
export function preserveEditedDraft(previous: AdminProduct, current: AdminProduct, draft: PlantDraft): PlantDraft {
  const before = draftFromPlant(previous), refreshed = draftFromPlant(current)
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value === before[key as keyof PlantDraft] ? refreshed[key as keyof PlantDraft] : value])) as unknown as PlantDraft
}
export function plantPatch(original: AdminProduct, draft: PlantDraft, canPrice: boolean, confirmPrice = false): Record<string, unknown> {
  const previous = draftFromPlant(original), patch: Record<string, unknown> = {}
  for (const key of ['common_name', 'scientific_name', 'description', 'watering_advice', 'light_type', 'recommended_climate', 'unit'] as const) {
    if (draft[key].trim() !== previous[key]) patch[key] = key === 'scientific_name' ? draft[key].trim() || null : draft[key].trim()
  }
  if (draft.category_id !== previous.category_id) patch.category_id = Number(draft.category_id)
  if (draft.minimum !== previous.minimum) {
    if (!/^\d+(?:\.\d{1,3})?$/.test(draft.minimum)) throw new Error('Revisa el mínimo de existencias.')
    patch.minimum_stock = Number(draft.minimum)
  }
  if (canPrice && (draft.price !== previous.price || confirmPrice)) {
    if (!draft.price.trim() || pesosToCents(draft.price) <= 0 || !Number.isSafeInteger(pesosToCents(draft.price))) throw new Error('Indica un precio mayor que cero, con hasta dos decimales.')
    patch.price_cents = pesosToCents(draft.price)
  }
  if (canPrice && draft.wholesale !== previous.wholesale) patch.wholesale_price_cents = draft.wholesale.trim() ? pesosToCents(draft.wholesale) : null
  return patch
}
export function filterPlants(products: AdminProduct[], preparations: Record<string, PlantPreparation>, balances: AdminInventoryBalance[], filters: PlantFilters): AdminProduct[] {
  const query = filters.search.trim().toLocaleLowerCase('es')
  return products.filter(p => (!query || [p.commonName, p.scientificName, p.internalCode, p.barcode].some(s => s?.toLocaleLowerCase('es').includes(query)))
    && (!filters.category || p.categoryId === filters.category)
    && (!filters.pending || ['PENDING', 'IMPORTED_PENDING'].includes(preparations[p.id]?.commercialState))
    && (!filters.low || balances.some(b => b.productId === p.id && b.isLowStock)))
}
// Use the sequence captured before opening the first card. Editing the current
// plant must not reorder or remove the next item from that working sequence.
export function nextPendingPlant(sequence: string[], current: string, preparations: Record<string, PlantPreparation>): string | null {
  return sequence.slice(sequence.indexOf(current) + 1).find(id => ['PENDING', 'IMPORTED_PENDING'].includes(preparations[id]?.commercialState)) ?? null
}
