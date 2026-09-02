import type { PublicCatalogProduct } from '../public-catalog/catalog-types'

export const WEB_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as const

export type WebOrderStatus = (typeof WEB_ORDER_STATUSES)[number]

export interface PublicOrderBranch {
  id: string
  code: string
  name: string
}

export interface PublicOrderOptions {
  schemaVersion: 1
  branches: PublicOrderBranch[]
}

export interface PublicCartItem {
  product: PublicCatalogProduct
  quantity: number
}

export interface SubmitWebOrderInput {
  orderId: string
  branchId: string
  customerName: string
  customerPhone: string
  customerEmail: string
  notes: string
  items: Array<{ productId: string; quantity: number }>
}

export interface SubmitWebOrderResult {
  schemaVersion: 1
  orderId: string
  orderNumber: string
  status: WebOrderStatus
  totalCents: number
  createdAt: string
  idempotentReplay: boolean
}

export interface AdminWebOrderItem {
  productId: string
  name: string
  code: string
  quantity: number
  listPriceCents: number
  unitPriceCents: number
  promotionName: string | null
  lineTotalCents: number
}

export interface AdminWebOrder {
  id: string
  orderNumber: string
  branch: PublicOrderBranch
  customer: { name: string; phone: string | null; email: string | null }
  notes: string | null
  subtotalCents: number
  discountCents: number
  totalCents: number
  status: WebOrderStatus
  createdAt: string
  updatedAt: string
  items: AdminWebOrderItem[]
}

export interface AdminWebOrdersResponse {
  schemaVersion: 1
  items: AdminWebOrder[]
  page: {
    limit: number
    hasMore: boolean
    nextCursor: { createdAt: string; id: string } | null
  }
  serverTime: string
}

export interface WebOrderStatusResult {
  schemaVersion: 1
  orderId: string
  status: WebOrderStatus
  updatedAt: string
  idempotentReplay: boolean
}
