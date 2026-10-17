import type { CatalogingFields } from './cataloging-service'
import { pesosToCents } from '../admin-catalog-parser'

export type WizardStep = 1 | 2 | 3

export interface WizardDraftForm {
  approved_name: string
  presentation: string
  category_id: number | null
  internal_code: string
  scientific_name: string
  barcode: string
  description: string
}

export function initialWizardForm(fields: CatalogingFields, originalName: string): WizardDraftForm {
  return {
    approved_name: fields.approved_name || originalName,
    presentation: fields.presentation || '',
    category_id: fields.category_id,
    internal_code: fields.internal_code || '',
    scientific_name: fields.scientific_name || '',
    barcode: fields.barcode || '',
    description: fields.description || '',
  }
}

export function validateStep1(form: WizardDraftForm): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!form.approved_name.trim()) errors.push('El nombre común es obligatorio.')
  if (!form.presentation.trim()) errors.push('La presentación (maceta, bolsa, etc.) es obligatoria.')
  if (form.category_id === null) errors.push('Selecciona una categoría para la planta.')
  return { valid: errors.length === 0, errors }
}

export function parseWizardPrice(priceStr: string): number | null {
  const trimmed = priceStr.trim()
  if (!trimmed) return null
  const cents = pesosToCents(trimmed)
  if (cents <= 0 || !Number.isSafeInteger(cents)) throw new Error('El precio debe ser un número mayor a cero.')
  return cents
}

export function parseWizardQuantity(qtyStr: string): number | null {
  const trimmed = qtyStr.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) throw new Error('La existencia física debe ser un número entero (0 o más).')
  const qty = Number(trimmed)
  if (!Number.isSafeInteger(qty) || qty < 0) throw new Error('La existencia física no puede ser negativa.')
  return qty
}

export function describePublicationResult(priceCents: number | null, quantity: number | null, ready?: boolean): {
  headline: string
  details: string
  statusType: 'ready' | 'pending'
} {
  const hasPrice = priceCents !== null && priceCents > 0
  const hasStock = quantity !== null && quantity > 0

  if (hasPrice && hasStock && ready !== false) {
    return {
      headline: '¡Planta añadida y lista para la venta!',
      details: 'Cuenta con precio confirmado y existencias iniciales aprobadas en esta sucursal.',
      statusType: 'ready',
    }
  }

  const missing: string[] = []
  if (!hasPrice) missing.push('precio confirmado')
  if (!hasStock) missing.push('existencias físicas')
  if (!missing.length) missing.push('habilitación de venta confirmada por el servidor')

  return {
    headline: 'Ficha añadida al catálogo interno',
    details: `Quedó registrada en el catálogo interno. Pendiente para venta: ${missing.join(' y ')}.`,
    statusType: 'pending',
  }
}
