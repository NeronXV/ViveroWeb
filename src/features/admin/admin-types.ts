import type { UserRole } from '../access/access-types'

export interface AdminBranch {
  id: string
  code: string
  name: string
  isActive: boolean
  activeStaffCount: number
  pendingSaleCount: number
  updatedAt: string
}

export interface AdminBranchCursor {
  code: string
  id: string
}

export interface AdminStaffBranch {
  id: string
  code: string
  name: string
  isActive: boolean
}

export interface AdminStaffRole {
  name: UserRole
  displayName: string
}

export interface AdminStaffMember {
  id: string
  fullName: string
  isActive: boolean
  branch: AdminStaffBranch | null
  role: AdminStaffRole | null
  updatedAt: string
}

export interface AdminStaffCursor {
  fullName: string
  id: string
}

export interface AdminPage<T, C> {
  schemaVersion: 1
  items: T[]
  page: {
    limit: number
    hasMore: boolean
    nextCursor: C | null
  }
  serverTime: string
}

export type AdminBranchesResponse = AdminPage<AdminBranch, AdminBranchCursor>
export type AdminStaffResponse = AdminPage<AdminStaffMember, AdminStaffCursor>

export interface BranchRow {
  id: string
  code: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateBranchInput {
  code: string
  name: string
}

export interface UpdateBranchInput {
  id: string
  code: string
  name: string
}

export interface AssignUserBranchInput {
  userId: string
  branchId: string
}

export interface AssignUserRoleInput {
  userId: string
  role: UserRole
}

export interface AdminDailySaleReportItem {
  branchId: string
  branchName: string
  day: string
  salesCount: number
  revenueCents: number
  discountCents: number
}

export interface AdminTopProductReportItem {
  productId: string
  productName: string
  productCode: string
  totalQuantity: number
  totalRevenueCents: number
}

export interface AdminInventoryBalance {
  branchId: string
  productId: string
  productName: string
  productCode: string
  productUnit: string
  totalQuantity: number
  minimumStock: number
  isLowStock: boolean
  balanceUpdatedAt: string | null
}

export interface AdminInventoryBalancesResponse {
  schemaVersion: 1
  branchId: string
  items: AdminInventoryBalance[]
  hasMore: boolean
  nextProductId: string | null
}

export interface AdminInventoryProductOption {
  id: string
  name: string
  unit: string
}

export interface RecordInventoryReceptionInput {
  productId: string
  quantity: number
  notes: string | null
  idempotencyKey: string
}

export interface ReconcileInventoryCountInput {
  productId: string
  countedQuantity: number
  reason: string
  idempotencyKey: string
}

export interface InventoryOperationResult {
  schemaVersion: 1
  idempotentReplay: boolean
  productId: string
  totalQuantity: number
  adjustmentQuantity: number | null
}

export interface InventoryMovement {
  id: string
  productId: string
  productName: string
  productCode: string
  movementType: string
  quantity: number
  notes: string | null
  createdAt: string
  createdByLabel: string | null
}

export interface InventoryHistoryResponse {
  schemaVersion: 1
  branchId: string
  items: InventoryMovement[]
  hasMore: boolean
}
