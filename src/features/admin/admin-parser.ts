import { USER_ROLES, type UserRole } from '../access/access-types'
import type {
  AdminBranch,
  AdminBranchesResponse,
  AdminBranchCursor,
  AdminStaffBranch,
  AdminStaffCursor,
  AdminStaffMember,
  AdminStaffResponse,
  AdminStaffRole,
  CreateBranchInput,
  UpdateBranchInput,
  AssignUserBranchInput,
  AssignUserRoleInput,
  AdminDailySaleReportItem,
  AdminTopProductReportItem,
} from './admin-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BRANCH_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,23}$/
const TIMESTAMP_WITH_ZONE_PATTERN = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/

export class AdminValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminValidationError'
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminValidationError(`${field} no es un objeto válido.`)
  }
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: string[], field: string): void {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  if (actual.length !== keys.length || !actual.every((key, index) => key === keys[index])) {
    throw new AdminValidationError(`${field} no tiene la estructura esperada.`)
  }
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new AdminValidationError(`${field} no contiene texto válido.`)
  }
  return value
}

function uuid(value: unknown, field: string): string {
  const result = text(value, field, 36)
  if (!UUID_PATTERN.test(result)) throw new AdminValidationError(`${field} no contiene un UUID válido.`)
  return result
}

function timestamp(value: unknown, field: string): string {
  const result = text(value, field, 64)
  if (!TIMESTAMP_WITH_ZONE_PATTERN.test(result) || Number.isNaN(Date.parse(result))) {
    throw new AdminValidationError(`${field} no contiene una fecha con zona horaria válida.`)
  }
  return result
}

function safeInteger(value: unknown, field: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new AdminValidationError(`${field} no contiene un entero válido.`)
  }
  return value
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new AdminValidationError(`${field} no contiene un booleano.`)
  return value
}

function branch(value: unknown, index: number): AdminBranch {
  const item = record(value, `items[${index}]`)
  exactKeys(item, ['id', 'code', 'name', 'isActive', 'activeStaffCount', 'pendingSaleCount', 'updatedAt'], `items[${index}]`)
  const code = text(item.code, `items[${index}].code`, 24)
  if (!BRANCH_CODE_PATTERN.test(code)) throw new AdminValidationError(`items[${index}].code no es válido.`)
  return {
    id: uuid(item.id, `items[${index}].id`),
    code,
    name: text(item.name, `items[${index}].name`, 120),
    isActive: boolean(item.isActive, `items[${index}].isActive`),
    activeStaffCount: safeInteger(item.activeStaffCount, `items[${index}].activeStaffCount`),
    pendingSaleCount: safeInteger(item.pendingSaleCount, `items[${index}].pendingSaleCount`),
    updatedAt: timestamp(item.updatedAt, `items[${index}].updatedAt`),
  }
}

function staffBranch(value: unknown, field: string): AdminStaffBranch {
  const item = record(value, field)
  exactKeys(item, ['id', 'code', 'name', 'isActive'], field)
  const code = text(item.code, `${field}.code`, 24)
  if (!BRANCH_CODE_PATTERN.test(code)) throw new AdminValidationError(`${field}.code no es válido.`)
  return {
    id: uuid(item.id, `${field}.id`),
    code,
    name: text(item.name, `${field}.name`, 120),
    isActive: boolean(item.isActive, `${field}.isActive`),
  }
}

function staffRole(value: unknown, field: string): AdminStaffRole {
  const item = record(value, field)
  exactKeys(item, ['name', 'displayName'], field)
  const name = text(item.name, `${field}.name`, 32)
  if (!USER_ROLES.includes(name as UserRole)) throw new AdminValidationError(`${field}.name no es un rol válido.`)
  return { name: name as UserRole, displayName: text(item.displayName, `${field}.displayName`, 120) }
}

function staff(value: unknown, index: number): AdminStaffMember {
  const field = `items[${index}]`
  const item = record(value, field)
  exactKeys(item, ['id', 'fullName', 'isActive', 'branch', 'role', 'updatedAt'], field)
  return {
    id: uuid(item.id, `${field}.id`),
    fullName: text(item.fullName, `${field}.fullName`, 160),
    isActive: boolean(item.isActive, `${field}.isActive`),
    branch: item.branch === null ? null : staffBranch(item.branch, `${field}.branch`),
    role: item.role === null ? null : staffRole(item.role, `${field}.role`),
    updatedAt: timestamp(item.updatedAt, `${field}.updatedAt`),
  }
}

function envelope(value: unknown): { root: Record<string, unknown>; items: unknown[]; page: Record<string, unknown> } {
  const root = record(value, 'respuesta')
  exactKeys(root, ['schemaVersion', 'items', 'page', 'serverTime'], 'respuesta')
  if (root.schemaVersion !== 1) throw new AdminValidationError('La versión del contrato administrativo no es compatible.')
  if (!Array.isArray(root.items)) throw new AdminValidationError('items no es una lista.')
  const page = record(root.page, 'page')
  exactKeys(page, ['limit', 'hasMore', 'nextCursor'], 'page')
  timestamp(root.serverTime, 'serverTime')
  return { root, items: root.items, page }
}

function page<C>(value: Record<string, unknown>, cursor: (value: unknown) => C): { limit: number; hasMore: boolean; nextCursor: C | null } {
  const limit = safeInteger(value.limit, 'page.limit', 1)
  if (limit > 100) throw new AdminValidationError('page.limit excede el máximo permitido.')
  const hasMore = boolean(value.hasMore, 'page.hasMore')
  const nextCursor = value.nextCursor === null ? null : cursor(value.nextCursor)
  if (hasMore !== (nextCursor !== null)) throw new AdminValidationError('La paginación administrativa es incoherente.')
  return { limit, hasMore, nextCursor }
}

function branchCursor(value: unknown): AdminBranchCursor {
  const item = record(value, 'page.nextCursor')
  exactKeys(item, ['code', 'id'], 'page.nextCursor')
  const code = text(item.code, 'page.nextCursor.code', 24)
  if (!BRANCH_CODE_PATTERN.test(code)) throw new AdminValidationError('page.nextCursor.code no es válido.')
  return { code, id: uuid(item.id, 'page.nextCursor.id') }
}

function staffCursor(value: unknown): AdminStaffCursor {
  const item = record(value, 'page.nextCursor')
  exactKeys(item, ['fullName', 'id'], 'page.nextCursor')
  return { fullName: text(item.fullName, 'page.nextCursor.fullName', 160), id: uuid(item.id, 'page.nextCursor.id') }
}

export function parseAdminBranchesResponse(value: unknown): AdminBranchesResponse {
  const parsed = envelope(value)
  return {
    schemaVersion: 1,
    items: parsed.items.map(branch),
    page: page(parsed.page, branchCursor),
    serverTime: timestamp(parsed.root.serverTime, 'serverTime'),
  }
}

export function parseAdminStaffResponse(value: unknown): AdminStaffResponse {
  const parsed = envelope(value)
  return {
    schemaVersion: 1,
    items: parsed.items.map(staff),
    page: page(parsed.page, staffCursor),
    serverTime: timestamp(parsed.root.serverTime, 'serverTime'),
  }
}

export function validateCreateBranchInput(code: unknown, name: unknown): CreateBranchInput {
  const validatedCode = text(code, 'code', 24)
  if (!BRANCH_CODE_PATTERN.test(validatedCode)) {
    throw new AdminValidationError('El código de sucursal sólo puede contener letras mayúsculas, números, guiones y guiones bajos.')
  }
  return {
    code: validatedCode,
    name: text(name, 'name', 120),
  }
}

export function validateUpdateBranchInput(id: unknown, code: unknown, name: unknown): UpdateBranchInput {
  const validatedCode = text(code, 'code', 24)
  if (!BRANCH_CODE_PATTERN.test(validatedCode)) {
    throw new AdminValidationError('El código de sucursal sólo puede contener letras mayúsculas, números, guiones y guiones bajos.')
  }
  return {
    id: uuid(id, 'id'),
    code: validatedCode,
    name: text(name, 'name', 120),
  }
}

export function validateAssignUserBranchInput(userId: unknown, branchId: unknown): AssignUserBranchInput {
  return {
    userId: uuid(userId, 'userId'),
    branchId: branchId === null || branchId === '' ? null : uuid(branchId, 'branchId'),
  }
}

export function validateAssignUserRoleInput(userId: unknown, role: unknown): AssignUserRoleInput {
  const validatedUserId = uuid(userId, 'userId')
  if (role === null || role === '' || role === 'NONE') {
    return { userId: validatedUserId, role: null }
  }
  const roleStr = text(role, 'role', 32)
  if (!USER_ROLES.includes(roleStr as UserRole)) {
    throw new AdminValidationError('El rol proporcionado no es válido.')
  }
  return {
    userId: validatedUserId,
    role: roleStr as UserRole,
  }
}

export function parseCreateBranchResponse(value: unknown): string {
  return uuid(value, 'createBranchResponse')
}

export function parseVoidResponse(value: unknown): null | boolean {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  throw new AdminValidationError('La respuesta de la mutación debe ser vacía (null) o booleana.')
}

export function parseAdminDailySalesReport(value: unknown): AdminDailySaleReportItem[] {
  if (!Array.isArray(value)) {
    throw new AdminValidationError('El reporte de ventas diarias debe ser una lista.')
  }
  return value.map((item, index) => {
    const label = `report[${index}]`
    const r = record(item, label)
    exactKeys(r, ['branchId', 'branchName', 'day', 'salesCount', 'revenueCents', 'discountCents'], label)
    return {
      branchId: uuid(r.branchId, `${label}.branchId`),
      branchName: text(r.branchName, `${label}.branchName`, 120),
      day: text(r.day, `${label}.day`, 64),
      salesCount: safeInteger(r.salesCount, `${label}.salesCount`),
      revenueCents: safeInteger(r.revenueCents, `${label}.revenueCents`),
      discountCents: safeInteger(r.discountCents, `${label}.discountCents`),
    }
  })
}

export function parseAdminTopProductsReport(value: unknown): AdminTopProductReportItem[] {
  if (!Array.isArray(value)) {
    throw new AdminValidationError('El reporte de productos más vendidos debe ser una lista.')
  }
  return value.map((item, index) => {
    const label = `report[${index}]`
    const r = record(item, label)
    exactKeys(r, ['productId', 'productName', 'productCode', 'totalQuantity', 'totalRevenueCents'], label)
    return {
      productId: uuid(r.productId, `${label}.productId`),
      productName: text(r.productName, `${label}.productName`, 120),
      productCode: text(r.productCode, `${label}.productCode`, 24),
      totalQuantity: safeInteger(r.totalQuantity, `${label}.totalQuantity`),
      totalRevenueCents: safeInteger(r.totalRevenueCents, `${label}.totalRevenueCents`),
    }
  })
}

