export type CashierClaimState = 'AVAILABLE' | 'CLAIMED_BY_ME' | 'CLAIMED_BY_OTHER'
export type CashierPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER'

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

// Nuevos tipos de la fase de cobros reales
export interface CashierClaimResponse {
  sale_id: string
  branch_id: string
  cashier_id: string
  claim_token: string
  created_at: string
  expires_at: string
  server_time: string
  renewed: boolean
}

export interface CashierReleaseClaimResponse {
  sale_id: string
  claim_token: string
  released_at: string
  closed_reason: 'EXPIRED' | 'RELEASED'
}

export interface CashierConfirmResponse {
  idempotent_replay: boolean
  sale: {
    id: string
    folio: string
    branch_id: string
    status: string
    total_cents: number
  }
  payment: {
    id: string
    sale_id: string
    cashier_id: string
    idempotency_key: string
    method: CashierPaymentMethod
    amount_due_cents: number
    amount_received_cents: number
    change_cents: number
    reference: string | null
    created_at: string
  }
}

export interface CashierPaymentResultResponse {
  schemaVersion: 1
  status: 'SUCCEEDED' | 'NOT_FOUND'
  sale?: {
    id: string
    folio: string
    createdAt: string
    totalCents: number
    createdByLabel: string | null
  }
  items?: CashierSaleDetailItem[]
  branch?: {
    name: string
  }
  payment?: {
    method: CashierPaymentMethod
    amountReceivedCents: number | null
    changeCents: number | null
    reference: string | null
    createdAt: string
  }
  serverTime: string
}

export type CashierPaymentStatus =
  | 'CLAIMING'
  | 'CLAIMED'
  | 'CONFIRMING'
  | 'UNCERTAIN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'

export interface CashierPaymentAttempt {
  version: 1
  userId: string
  saleId: string
  idempotencyKey: string
  status: CashierPaymentStatus
  claimToken: string | null
  claimExpiresAt: string | null
  method: CashierPaymentMethod | null
  amountReceivedCents: number | null
  reference: string | null
  errorMsg: string | null
  paymentResult: CashierPaymentResultResponse | null
}
