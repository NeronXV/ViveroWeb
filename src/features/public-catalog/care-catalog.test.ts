import { describe, expect, it } from 'vitest'
import { answerFromCatalog, normalizeCareText, recommendPlants } from './care-catalog'
import type { PublicCatalogProduct } from './catalog-types'
const plant = (name: string, light: string, climate = 'Templado'): PublicCatalogProduct => ({
 id: name, name, scientificName: null, description: '', category: { id: 'plants', name: 'Plantas' },
 price: { amountCents: 12000, originalAmountCents: null, discountPercent: null, currency: 'MXN', unit: 'pieza' },
 care: { lightType: light, recommendedClimate: climate, wateringAdvice: 'Cuando el sustrato se seque' },
 image: null, activePromotion: null, publicationStatus: 'LISTED',
})
describe('real catalog care', () => {
 it('normalizes accents and capitalization', () => expect(normalizeCareText('ÁRBOL')).toBe('arbol'))
 it('does not present partial shade as full shade', () => {
  expect(recommendPlants([plant('A', 'Semisombra'), plant('B', 'Sombra')], 'shade', 'any').map(p => p.name)).toEqual(['B'])
 })
 it('requires both recorded light and climate', () => {
  expect(recommendPlants([plant('A', 'Pleno sol', 'Tropical'), plant('B', 'Pleno sol')], 'sun', 'templado').map(p => p.name)).toEqual(['B'])
 })
 it('does not invent matches for an empty catalog', () => expect(recommendPlants([], 'sun', 'any')).toEqual([]))
 it('limits suggestions to six products', () => expect(recommendPlants(Array.from({ length: 9 }, (_, i) => plant(String(i), 'Sombra')), 'shade', 'any')).toHaveLength(6))
 it('answers from the named plant facts', () => expect(answerFromCatalog([plant('Árbol limón', 'Sol directo')], 'riego del arbol limon')).toContain('Cuando el sustrato se seque'))
 it('acknowledges missing care fields', () => expect(answerFromCatalog([plant('Helecho', '')], 'Helecho')).toContain('Sin dato registrado'))
 it('does not manufacture a diagnosis for an unknown plant', () => expect(answerFromCatalog([], 'hojas amarillas')).toContain('No encontré'))
})
