import type { PublicCatalogProduct } from './catalog-types'
export const normalizeCareText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function recommendPlants(products: PublicCatalogProduct[], light: string, climate: string) {
  const lightTerms: Record<string, string[]> = { sun: ['sol directo', 'pleno sol'], indirect: ['indirecta', 'semisombra'], shade: ['sombra'] }
  return products.filter((product) => {
    const actualLight = normalizeCareText(product.care.lightType)
    const lightMatches = (lightTerms[light] ?? []).some((term) => actualLight.includes(term))
      && (light !== 'shade' || !actualLight.includes('semisombra'))
    return lightMatches && (climate === 'any' || normalizeCareText(product.care.recommendedClimate).includes(climate))
  }).slice(0, 6)
}
export function answerFromCatalog(products: PublicCatalogProduct[], question: string): string {
  const query = normalizeCareText(question)
  const matches = products.filter((product) =>
    query.includes(normalizeCareText(product.name)) ||
    (product.scientificName && query.includes(normalizeCareText(product.scientificName))))
  if (!matches.length) {
    const terms = query.split(/[^a-z0-9]+/).filter((term) => term.length >= 4)
    matches.push(...products.filter((product) => terms.some((term) =>
      normalizeCareText(product.name + ' ' + (product.scientificName ?? '')).includes(term))))
  }
  if (!matches.length) return 'No encontré esa planta en el catálogo consultado. Escribe su nombre como aparece en la tienda. Para síntomas o plagas, consulta al personal del vivero.'
  return matches.slice(0, 3).map((product) => product.name + '\nLuz: ' + (product.care.lightType || 'Sin dato registrado') +
    '\nRiego: ' + (product.care.wateringAdvice || 'Sin dato registrado') + '\nClima: ' +
    (product.care.recommendedClimate || 'Sin dato registrado')).join('\n\n') +
    '\n\nInformación de las fichas del catálogo. No confirma causas de enfermedades ni seguridad para mascotas.'
}
