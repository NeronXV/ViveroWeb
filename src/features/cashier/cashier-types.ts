export type CashierClaimState = 'AVAILABLE' | 'CLAIMED_BY_ME' | 'CLAIMED_BY_OTHER'

export interface CashierSale {
  id: string
  folio: string
  createdAt: string
  totalCents: number
  itemCount: number
  status: string
  createdByLabel: string | null
  claimState: CashierClaimState
  claimExpiresAt: string | null
  serverTime: string
}

export interface CashierCursor {
  createdAt: string
  id: string
}

export interface CashierPageInfo {
  limit: number
  hasMore: boolean
  nextCursor: CashierCursor | null
}

export interface CashierSalesResponse {
  schemaVersion: 1
  items: CashierSale[]
  page: CashierPageInfo
}

export interface CashierSaleDetailItem {
  id: string | number
  productName: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}

export interface CashierSaleDetailResponse {
  schemaVersion: 1
  sale: CashierSale
  items: CashierSaleDetailItem[]
}
