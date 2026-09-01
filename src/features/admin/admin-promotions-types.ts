export type PromotionScope = 'ALL_PRODUCTS' | 'SELECTED_PRODUCTS'
export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT'

export interface UpsertCatalogPromotionInput {
  id?: string | null
  name: string
  description?: string | null
  scope: PromotionScope
  promoType: PromotionType
  value: number // Porcentaje (1-90) o centavos por unidad
  minPurchaseCents?: number | null
  maxDiscountCents?: number | null
  startsAt?: string | null
  endsAt?: string | null
  isActive: boolean
  productIds: string[]
}

export interface AdminPromotion {
  id: string
  name: string
  description: string | null
  scope: PromotionScope
  promoType: PromotionType
  value: number
  minPurchaseCents: number | null
  maxDiscountCents: number | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  productIds: string[]
  createdAt?: string
  updatedAt?: string
}
