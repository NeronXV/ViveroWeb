export type ProductUnit = 'pieza' | 'maceta' | 'charola' | 'bolsa' | 'kg'

export interface AdminCategory {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminProduct {
  id: string
  internalCode: string
  barcode: string | null
  commonName: string
  scientificName: string | null
  description: string
  categoryId: string
  priceCents: number
  wholesalePriceCents: number | null
  unit: ProductUnit
  minimumStock: number
  wateringAdvice: string
  lightType: string
  recommendedClimate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  categoryName?: string
}

export interface UpsertProductInput {
  id?: string
  internalCode: string
  barcode: string | null
  commonName: string
  scientificName: string | null
  description: string | null
  categoryId: string
  priceCents: number
  wholesalePriceCents: number | null
  unit: ProductUnit
  minimumStock: number
  wateringAdvice: string | null
  lightType: string | null
  recommendedClimate: string | null
  isActive: boolean
}

export interface UpsertCategoryInput {
  id?: string
  name: string
  description: string | null
  isActive: boolean
}
