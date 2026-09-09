export type PaymentTerms = 'CASH' | 'CREDIT' | 'OTHER'
export type PurchaseStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED'
export type ResolutionStatus = 'UNMATCHED' | 'AUTO_MATCHED' | 'MATCHED' | 'IGNORED'
export type SizeUnit = 'cm' | 'in' | 'l' | 'gal'

export interface Supplier {
  id: string
  code: string
  name: string
}

export interface PurchaseSourceItem {
  lineNumber: number
  rawDescription: string
  containerCode: string
  suggestedCommonName: string | null
  suggestedPresentation: string | null
  quantity: number
  unitCostCents: number
}

export interface SupplierPurchaseListItem {
  id: string
  supplier: Supplier
  documentDate: string
  externalReference: string | null
  paymentTerms: PaymentTerms
  expectedTotalCents: number
  status: PurchaseStatus
  itemCount: number
  unmatchedCount: number
  createdAt: string
  receivedAt: string | null
}

export interface SupplierPurchasesResponse {
  schemaVersion: number
  branchId: string
  items: SupplierPurchaseListItem[]
}

export interface SupplierPurchaseDetailItem {
  id: string
  lineNumber: number
  rawDescription: string
  containerCode: string
  supplierPresentation: string | null
  suggestedCommonName: string | null
  suggestedPresentation: string | null
  quantity: number
  unitCostCents: number
  lineTotalCents: number
  productId: string | null
  resolutionStatus: ResolutionStatus
}

export interface SupplierPurchaseDetail {
  id: string
  branchId?: string
  supplier: Supplier
  documentDate: string
  externalReference: string | null
  paymentTerms: PaymentTerms
  expectedTotalCents: number
  status: PurchaseStatus
  itemCount: number
  unmatchedCount: number
  sourceFileName: string | null
  createdAt: string
  receivedAt: string | null
  items: SupplierPurchaseDetailItem[]
}

export interface UpsertSupplierInput {
  code: string
  name: string
  id?: string | null
}

export interface CreatePurchaseDraftInput {
  supplierId: string
  documentDate: string // YYYY-MM-DD
  externalReference: string | null
  paymentTerms: PaymentTerms
  expectedTotalCents: number
  sourceFileName: string | null
  items: PurchaseSourceItem[]
  idempotencyKey: string
}

export interface SetSupplierPresentationInput {
  supplierId: string
  code: string
  displayName: string
  nominalSize: number | null
  sizeUnit: SizeUnit | null
  notes: string | null
}

export interface ResolvePurchaseItemInput {
  itemId: string
  resolution: 'MATCHED' | 'IGNORED'
  productId: string | null
  normalizedName: string | null
  presentation: string | null
}

export interface ConfirmPurchaseInput {
  purchaseId: string
  confirmationKey: string
}
