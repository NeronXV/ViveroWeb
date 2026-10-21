import type { AdminProduct } from '../admin-catalog-types'
import type { PurchaseSourceItem } from './purchases-types'

export type ReceptionReviewLine = PurchaseSourceItem & {
  productId: string; name: string; presentation: string; received: string
  documentQuantity: string; cost: string; newPlant: boolean
}

export function prepareReceptionSource(lines: ReceptionReviewLine[], documentTotal: string, totalRequired = false): PurchaseSourceItem[] {
  if (!lines.length || lines.length > 100) throw new Error('Revisa la lista: debe tener entre 1 y 100 partidas.')
  const items = lines.map((line, index) => {
    const cost = readMoney(line.cost)
    if (!/^\d+$/.test(line.documentQuantity) || Number(line.documentQuantity) > 1000000 || cost === null) throw new Error(`Revisa cantidad y costo del documento en la partida ${index + 1}.`)
    if (!isPlantDescription(line.rawDescription) || line.rawDescription.trim().length < 2 || line.rawDescription.trim().length > 240 || !isPlantDescription(line.name) || line.name.trim().length < 2 || line.name.trim().length > 160) throw new Error(`Revisa el nombre de la partida ${index + 1}; debe ser una planta, no un encabezado o importe.`)
    return { lineNumber: index + 1, rawDescription: line.rawDescription.trim(), containerCode: line.containerCode, suggestedCommonName: line.name.trim(), suggestedPresentation: line.presentation.trim() || null, quantity: Number(line.documentQuantity), unitCostCents: cost }
  })
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0)
  if (!Number.isSafeInteger(total)) throw new Error('El importe del documento es demasiado grande. Revisa los costos.')
  if ((totalRequired || documentTotal.trim()) && (readMoney(documentTotal) === null || total !== readMoney(documentTotal))) throw new Error('La suma de las partidas no coincide con el total del documento. Revisa cantidades, costos y partidas faltantes.')
  return items
}

// Only money, never digits salvaged from a description or supplier SKU.
export function readMoney(value: string): number | null {
  const clean = value.trim().replace(/^\$\s*/, '')
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(clean)) return null
  const [whole, fraction = ''] = clean.replaceAll(',', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function isPlantDescription(value: string): boolean {
  const name = value.trim()
  return /\p{L}/u.test(name) && !/^(cant(?:idad)?\.?|descripci[oó]n(?: por revisar)?|total|subtotal|precio|importe|costo(?: unitario)?)\s*:?$/i.test(name)
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function suggestReceptionProducts(name: string, products: AdminProduct[]): AdminProduct[] {
  const query = normalize(name)
  if (query.length < 3 || !isPlantDescription(name)) return []
  const words = query.split(' ').filter(w => w.length > 2)
  return products.filter(p => p.isActive).map(product => {
    const candidate = normalize(product.commonName)
    const tokens = new Set(candidate.split(' '))
    const shared = words.filter(w => tokens.has(w)).length
    const score = candidate === query ? 3 : candidate.includes(query) || query.includes(candidate) ? 2 : words.length && shared / words.length >= 0.6 ? 1 : 0
    return { product, score }
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score || a.product.commonName.localeCompare(b.product.commonName)).slice(0, 5).map(p => p.product)
}
