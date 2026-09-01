export interface PublicCatalogCategory {
  id: string
  name: string
}

export interface PublicCatalogImage {
  bucketName: 'catalog-images'
  storagePath: string
  altText: string | null
}

export interface PublicCatalogPromotion {
  id: string
  name: string
}

export interface PublicCatalogPrice {
  amountCents: number
  originalAmountCents: number | null
  discountPercent: number | null
  currency: 'MXN'
  unit: string
}

export interface PublicCatalogProduct {
  id: string
  name: string
  scientificName: string | null
  description: string
  category: PublicCatalogCategory
  price: PublicCatalogPrice
  care: {
    wateringAdvice: string
    lightType: string
    recommendedClimate: string
  }
  image: PublicCatalogImage | null
  activePromotion: PublicCatalogPromotion | null
  publicationStatus: 'LISTED'
}

export interface PublicCatalogCursor {
  sortName: string
  id: string
}

export interface PublicCatalogResponse {
  schemaVersion: 3
  items: PublicCatalogProduct[]
  categories: PublicCatalogCategory[]
  page: {
    limit: number
    hasMore: boolean
    nextCursor: PublicCatalogCursor | null
  }
}

export type PublicCatalogStatus = 'loading' | 'ready' | 'error'
