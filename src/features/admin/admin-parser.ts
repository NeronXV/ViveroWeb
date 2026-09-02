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
  BranchRow,
  CreateBranchInput,
  UpdateBranchInput,
  AssignUserBranchInput,
  AssignUserRoleInput,
  AdminRoleOption,
  AdminRoleOptionsResponse,
  SetAdminStaffRoleInput,
  SetAdminStaffRoleResult,
  AdminDailySaleReportItem,
  AdminTopProductReportItem,
  AdminInventoryBalancesResponse,
  RecordInventoryReceptionInput,
  ReconcileInventoryCountInput,
  InventoryOperationResult,
  InventoryHistoryResponse,
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

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AdminValidationError(`${field} no contiene una cantidad válida.`)
  }
  return value
}

function signedInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new AdminValidationError(`${field} no contiene un entero válido.`)
  }
  return value
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null
  return text(value, field, max)
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
  const code = text(item.code, `${field}.code`, 24)
  if (!BRANCH_CODE_PATTERN.test(code)) throw new AdminValidationError(`${field}.code no es válido.`)
  const isActive = typeof item.isActive === 'boolean'
    ? item.isActive
    : (typeof item.is_active === 'boolean' ? item.is_active : true)
  return {
    id: uuid(item.id, `${field}.id`),
    code,
    name: text(item.name, `${field}.name`, 120),
    isActive,
  }
}

function staffRole(value: unknown, field: string): AdminStaffRole {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase()
    if (!USER_ROLES.includes(upper as UserRole)) {
      throw new AdminValidationError(`${field} no es un rol válido.`)
    }
    const displayNames: Record<UserRole, string> = {
      OWNER: 'Propietario',
      ADMIN: 'Administrador',
      MANAGER: 'Gerente',
      INVENTORY: 'Inventario',
      CASHIER: 'Cajero',
      SALES: 'Vendedor',
    }
    return { name: upper as UserRole, displayName: displayNames[upper as UserRole] || upper }
  }

  const item = record(value, field)
  const rawName = typeof item.name === 'string' ? item.name : (typeof item.code === 'string' ? item.code : '')
  const upper = rawName.trim().toUpperCase()
  if (!USER_ROLES.includes(upper as UserRole)) {
    throw new AdminValidationError(`${field}.name no es un rol válido.`)
  }
  const displayName = typeof item.displayName === 'string'
    ? item.displayName
    : (typeof item.name === 'string' ? item.name : upper)
  return { name: upper as UserRole, displayName }
}

function staff(value: unknown, index: number): AdminStaffMember {
  const field = `items[${index}]`
  const item = record(value, field)

  if ('email' in item || 'password' in item || 'email_confirmed_at' in item || 'raw_user_meta_data' in item) {
    throw new AdminValidationError(`${field} contiene campos no permitidos.`)
  }

  const rawFullName = item.fullName ?? item.full_name
  const rawIsActive = typeof item.isActive === 'boolean'
    ? item.isActive
    : (typeof item.is_active === 'boolean' ? item.is_active : true)
  const rawUpdatedAt = item.updatedAt ?? item.updated_at ?? item.created_at ?? new Date().toISOString()

  let parsedBranch: AdminStaffBranch | null = null
  if (item.branch !== null && item.branch !== undefined) {
    parsedBranch = staffBranch(item.branch, `${field}.branch`)
  }

  let parsedRole: AdminStaffRole | null = null
  if (item.role !== null && item.role !== undefined && item.role !== '') {
    parsedRole = staffRole(item.role, `${field}.role`)
  }

  return {
    id: uuid(item.id, `${field}.id`),
    fullName: text(rawFullName, `${field}.fullName`, 160),
    isActive: boolean(rawIsActive, `${field}.isActive`),
    branch: parsedBranch,
    role: parsedRole,
    updatedAt: timestamp(rawUpdatedAt, `${field}.updatedAt`),
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
  const rawFullName = item.fullName ?? item.full_name
  return { fullName: text(rawFullName, 'page.nextCursor.fullName', 160), id: uuid(item.id, 'page.nextCursor.id') }
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
  const root = record(value, 'respuesta')
  if (!Array.isArray(root.items)) throw new AdminValidationError('items no es una lista.')

  let pageData: { limit: number; hasMore: boolean; nextCursor: AdminStaffCursor | null }

  if (root.page && typeof root.page === 'object') {
    pageData = page(root.page as Record<string, unknown>, staffCursor)
  } else {
    const hasMore = Boolean(root.has_more ?? root.hasMore)
    const nextCursorId = (root.next_cursor_id ?? root.nextCursorId) as string | null
    const nextCursorFullName = (root.next_cursor_full_name ?? root.nextCursorFullName) as string | null
    const nextCursor = (hasMore && nextCursorId && nextCursorFullName)
      ? { id: nextCursorId, fullName: nextCursorFullName }
      : null
    pageData = {
      limit: typeof root.limit === 'number' ? root.limit : 50,
      hasMore,
      nextCursor,
    }
  }

  const serverTime = root.serverTime
    ? timestamp(root.serverTime, 'serverTime')
    : (root.server_time ? timestamp(root.server_time, 'server_time') : new Date().toISOString())

  return {
    schemaVersion: 1,
    items: root.items.map(staff),
    page: pageData,
    serverTime,
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
  if (branchId === null || branchId === '') {
    throw new AdminValidationError('Debes seleccionar una sucursal activa.')
  }
  return {
    userId: uuid(userId, 'userId'),
    branchId: uuid(branchId, 'branchId'),
  }
}

export function validateAssignUserRoleInput(userId: unknown, role: unknown): AssignUserRoleInput {
  if (role === null || role === '' || role === 'NONE') {
    throw new AdminValidationError('Debes seleccionar un rol válido.')
  }
  const roleStr = text(role, 'role', 32)
  if (!USER_ROLES.includes(roleStr as UserRole)) {
    throw new AdminValidationError('El rol proporcionado no es válido.')
  }
  return {
    userId: uuid(userId, 'userId'),
    role: roleStr as UserRole,
  }
}

export function validateSetAdminStaffRoleInput(userId: unknown, roleName: unknown): SetAdminStaffRoleInput {
  if (roleName === null || roleName === '' || roleName === 'NONE') {
    throw new AdminValidationError('Debes seleccionar un rol válido.')
  }
  const roleStr = text(roleName, 'roleName', 32)
  if (!USER_ROLES.includes(roleStr as UserRole)) {
    throw new AdminValidationError('El rol proporcionado no es válido.')
  }
  return {
    userId: uuid(userId, 'userId'),
    roleName: roleStr as UserRole,
  }
}

export function parseAdminRoleOptionsResponse(value: unknown): AdminRoleOptionsResponse {
  const root = record(value, 'respuesta de opciones de rol')
  exactKeys(root, ['schemaVersion', 'actorRole', 'items', 'serverTime'], 'respuesta de opciones de rol')
  if (root.schemaVersion !== 1) {
    throw new AdminValidationError('La versión del contrato de opciones de rol no es compatible.')
  }
  if (root.actorRole !== 'ADMIN' && root.actorRole !== 'OWNER') {
    throw new AdminValidationError('actorRole no contiene un rol válido.')
  }
  if (!Array.isArray(root.items)) {
    throw new AdminValidationError('items debe ser una lista de opciones de rol.')
  }

  const items: AdminRoleOption[] = root.items.map((entry, index) => {
    const field = `items[${index}]`
    const item = record(entry, field)
    exactKeys(item, ['name', 'displayName', 'capabilities'], field)

    const rawName = text(item.name, `${field}.name`, 32)
    if (!USER_ROLES.includes(rawName as UserRole)) {
      throw new AdminValidationError(`${field}.name no es un rol válido.`)
    }

    const displayName = text(item.displayName, `${field}.displayName`, 120)

    if (!Array.isArray(item.capabilities)) {
      throw new AdminValidationError(`${field}.capabilities debe ser una lista.`)
    }

    const capabilities = item.capabilities.map((cap, capIdx) =>
      text(cap, `${field}.capabilities[${capIdx}]`, 64)
    )

    return {
      name: rawName as UserRole,
      displayName,
      capabilities,
    }
  })

  return {
    schemaVersion: 1,
    actorRole: root.actorRole,
    items,
    serverTime: timestamp(root.serverTime, 'serverTime'),
  }
}

export function parseSetAdminStaffRoleResult(value: unknown): SetAdminStaffRoleResult {
  const root = record(value, 'resultado de asignación de rol')
  exactKeys(root, ['schemaVersion', 'userId', 'role', 'updatedAt', 'serverTime'], 'resultado de asignación de rol')
  if (root.schemaVersion !== 1) {
    throw new AdminValidationError('La versión del contrato de asignación no es compatible.')
  }

  const roleObj = record(root.role, 'role')
  exactKeys(roleObj, ['name', 'displayName'], 'role')

  const rawName = text(roleObj.name, 'role.name', 32)
  if (!USER_ROLES.includes(rawName as UserRole)) {
    throw new AdminValidationError('role.name no es un rol válido.')
  }

  const displayName = text(roleObj.displayName, 'role.displayName', 120)

  return {
    schemaVersion: 1,
    userId: uuid(root.userId, 'userId'),
    role: {
      name: rawName as UserRole,
      displayName,
    },
    updatedAt: timestamp(root.updatedAt, 'updatedAt'),
    serverTime: timestamp(root.serverTime, 'serverTime'),
  }
}

export function validateSetUserActiveInput(userId: unknown, isActive: unknown): { userId: string; isActive: boolean } {
  return {
    userId: uuid(userId, 'El ID de usuario'),
    isActive: boolean(isActive, 'El estado de activación'),
  }
}

export function parseBranchRowResponse(value: unknown): BranchRow {
  const row = record(value, 'branchRow')
  exactKeys(row, ['id', 'code', 'name', 'is_active', 'created_at', 'updated_at'], 'branchRow')
  const code = text(row.code, 'branchRow.code', 24)
  if (!BRANCH_CODE_PATTERN.test(code)) {
    throw new AdminValidationError('branchRow.code no es válido.')
  }
  return {
    id: uuid(row.id, 'branchRow.id'),
    code,
    name: text(row.name, 'branchRow.name', 120),
    isActive: boolean(row.is_active, 'branchRow.is_active'),
    createdAt: timestamp(row.created_at, 'branchRow.created_at'),
    updatedAt: timestamp(row.updated_at, 'branchRow.updated_at'),
  }
}

export function parseVoidResponse(value: unknown): null {
  if (value === null) return null
  throw new AdminValidationError('La respuesta de la mutación debe ser vacía (null).')
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

export function parseAdminInventoryBalances(value: unknown): AdminInventoryBalancesResponse {
  const root = record(value, 'respuesta de inventario')
  exactKeys(root, ['schemaVersion', 'branchId', 'items', 'hasMore', 'nextProductId'], 'respuesta de inventario')
  if (root.schemaVersion !== 1) throw new AdminValidationError('La versión del contrato de inventario no es compatible.')
  if (!Array.isArray(root.items)) throw new AdminValidationError('Los saldos de inventario no son una lista.')

  const branchId = uuid(root.branchId, 'branchId')

  const items = root.items.map((value, index) => {
    const field = `items[${index}]`
    const item = record(value, field)
    exactKeys(item, [
      'productId', 'productName', 'productCode', 'productUnit',
      'totalQuantity', 'minimumStock', 'isLowStock', 'balanceUpdatedAt',
    ], field)
    const totalQuantity = nonNegativeNumber(item.totalQuantity, `${field}.totalQuantity`)
    const minimumStock = nonNegativeNumber(item.minimumStock, `${field}.minimumStock`)
    const isLowStock = boolean(item.isLowStock, `${field}.isLowStock`)
    if (isLowStock !== (totalQuantity <= minimumStock)) {
      throw new AdminValidationError(`${field}.isLowStock es incoherente.`)
    }
    return {
      branchId,
      productId: uuid(item.productId, `${field}.productId`),
      productName: text(item.productName, `${field}.productName`, 160),
      productCode: text(item.productCode, `${field}.productCode`, 40),
      productUnit: text(item.productUnit, `${field}.productUnit`, 20),
      totalQuantity,
      minimumStock,
      isLowStock,
      balanceUpdatedAt: item.balanceUpdatedAt === null
        ? null
        : timestamp(item.balanceUpdatedAt, `${field}.balanceUpdatedAt`),
    }
  })

  const hasMore = boolean(root.hasMore, 'hasMore')
  const nextProductId = root.nextProductId === null ? null : uuid(root.nextProductId, 'nextProductId')
  if (hasMore !== (nextProductId !== null)) {
    throw new AdminValidationError('La paginación del inventario es incoherente.')
  }
  return { schemaVersion: 1, branchId, items, hasMore, nextProductId }
}

export function validateInventoryReceptionInput(
  productId: unknown,
  quantity: unknown,
  notes: unknown,
  idempotencyKey: unknown,
): RecordInventoryReceptionInput {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
    throw new AdminValidationError('La cantidad recibida debe ser un entero entre 1 y 100000.')
  }
  if (typeof notes !== 'string') throw new AdminValidationError('Las notas de recepción no son válidas.')
  const normalizedNotes = notes.trim()
  if (normalizedNotes.length > 240) throw new AdminValidationError('Las notas no pueden superar 240 caracteres.')
  return {
    productId: uuid(productId, 'productId'),
    quantity,
    notes: normalizedNotes === '' ? null : normalizedNotes,
    idempotencyKey: uuid(idempotencyKey, 'idempotencyKey'),
  }
}

export function validateInventoryCountInput(
  productId: unknown,
  countedQuantity: unknown,
  reason: unknown,
  idempotencyKey: unknown,
): ReconcileInventoryCountInput {
  if (typeof countedQuantity !== 'number' || !Number.isInteger(countedQuantity) || countedQuantity < 0 || countedQuantity > 100_000) {
    throw new AdminValidationError('La existencia contada debe ser un entero entre 0 y 100000.')
  }
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 240) {
    throw new AdminValidationError('El motivo debe tener entre 3 y 240 caracteres.')
  }
  return {
    productId: uuid(productId, 'productId'),
    countedQuantity,
    reason: reason.trim(),
    idempotencyKey: uuid(idempotencyKey, 'idempotencyKey'),
  }
}

export function parseInventoryReceptionResult(value: unknown): InventoryOperationResult {
  const root = record(value, 'recepción de inventario')
  exactKeys(root, ['schemaVersion', 'idempotentReplay', 'movementId', 'productId', 'quantity', 'totalQuantity'], 'recepción de inventario')
  if (root.schemaVersion !== 1) throw new AdminValidationError('La versión de la recepción no es compatible.')
  uuid(root.movementId, 'movementId')
  safeInteger(root.quantity, 'quantity', 1)
  return {
    schemaVersion: 1,
    idempotentReplay: boolean(root.idempotentReplay, 'idempotentReplay'),
    productId: uuid(root.productId, 'productId'),
    totalQuantity: safeInteger(root.totalQuantity, 'totalQuantity'),
    adjustmentQuantity: null,
  }
}

export function parseInventoryCountResult(value: unknown): InventoryOperationResult {
  const root = record(value, 'conteo de inventario')
  exactKeys(root, [
    'schemaVersion', 'idempotentReplay', 'countId', 'productId', 'previousQuantity',
    'countedQuantity', 'adjustmentQuantity', 'totalQuantity',
  ], 'conteo de inventario')
  if (root.schemaVersion !== 1) throw new AdminValidationError('La versión del conteo no es compatible.')
  uuid(root.countId, 'countId')
  const counted = safeInteger(root.countedQuantity, 'countedQuantity')
  const total = safeInteger(root.totalQuantity, 'totalQuantity')
  if (counted !== total) throw new AdminValidationError('El saldo del conteo no coincide con la existencia contada.')
  return {
    schemaVersion: 1,
    idempotentReplay: boolean(root.idempotentReplay, 'idempotentReplay'),
    productId: uuid(root.productId, 'productId'),
    totalQuantity: total,
    adjustmentQuantity: signedInteger(root.adjustmentQuantity, 'adjustmentQuantity'),
  }
}

export function parseInventoryHistory(value: unknown): InventoryHistoryResponse {
  const root = record(value, 'historial de inventario')
  exactKeys(root, ['schemaVersion', 'branchId', 'items', 'hasMore', 'nextCursor'], 'historial de inventario')
  if (root.schemaVersion !== 1 || !Array.isArray(root.items)) {
    throw new AdminValidationError('El historial de inventario no es compatible.')
  }
  const items = root.items.map((entry, index) => {
    const field = `items[${index}]`
    const item = record(entry, field)
    exactKeys(item, ['id', 'productId', 'productName', 'productCode', 'movementType', 'quantity', 'notes', 'createdAt', 'createdByLabel'], field)
    return {
      id: uuid(item.id, `${field}.id`),
      productId: uuid(item.productId, `${field}.productId`),
      productName: text(item.productName, `${field}.productName`, 160),
      productCode: text(item.productCode, `${field}.productCode`, 40),
      movementType: text(item.movementType, `${field}.movementType`, 32),
      quantity: signedInteger(item.quantity, `${field}.quantity`),
      notes: nullableText(item.notes, `${field}.notes`, 240),
      createdAt: timestamp(item.createdAt, `${field}.createdAt`),
      createdByLabel: nullableText(item.createdByLabel, `${field}.createdByLabel`, 160),
    }
  })
  if (root.nextCursor !== null) {
    const cursor = record(root.nextCursor, 'nextCursor')
    exactKeys(cursor, ['createdAt', 'id'], 'nextCursor')
    timestamp(cursor.createdAt, 'nextCursor.createdAt')
    uuid(cursor.id, 'nextCursor.id')
  }
  if (root.hasMore === true && root.nextCursor === null) {
    throw new AdminValidationError('El historial indicó más resultados sin cursor.')
  }
  if (root.hasMore === false && root.nextCursor !== null) {
    throw new AdminValidationError('El historial devolvió un cursor innecesario.')
  }
  return {
    schemaVersion: 1,
    branchId: uuid(root.branchId, 'branchId'),
    items,
    hasMore: boolean(root.hasMore, 'hasMore'),
  }
}
