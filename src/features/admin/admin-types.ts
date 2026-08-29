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
  branchId: string | null
}

export interface AssignUserRoleInput {
  userId: string
  role: UserRole | null
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
