import { getSupabaseClient } from '../../lib/supabase/client'
import {
  parseAdminBranchesResponse,
  parseAdminStaffResponse,
  parseBranchRowResponse,
  parseVoidResponse,
  validateAssignUserBranchInput,
  validateAssignUserRoleInput,
  validateCreateBranchInput,
  validateUpdateBranchInput,
  validateSetUserActiveInput,
  parseAdminDailySalesReport,
  parseAdminTopProductsReport,
  parseAdminInventoryBalances,
  validateInventoryReceptionInput,
  validateInventoryCountInput,
  parseInventoryReceptionResult,
  parseInventoryCountResult,
  parseInventoryHistory,
} from './admin-parser'
import { loadPublicCatalog } from '../public-catalog/catalog-service'
import type {
  AdminBranchCursor,
  AdminBranchesResponse,
  AdminStaffCursor,
  AdminStaffResponse,
  AssignUserBranchInput,
  AssignUserRoleInput,
  BranchRow,
  CreateBranchInput,
  UpdateBranchInput,
  AdminDailySaleReportItem,
  AdminTopProductReportItem,
  AdminInventoryBalancesResponse,
  AdminInventoryProductOption,
  RecordInventoryReceptionInput,
  ReconcileInventoryCountInput,
  InventoryOperationResult,
  InventoryHistoryResponse,
} from './admin-types'

const ADMIN_TIMEOUT_MS = 8_000

export class AdminServiceError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'AdminServiceError'
  }
}
async function adminRequest<T>(
  rpc:
    | 'get_admin_branches'
    | 'get_admin_staff'
    | 'create_branch'
    | 'update_branch'
    | 'set_branch_active'
    | 'assign_user_branch'
    | 'assign_user_role'
    | 'set_user_active'
    | 'get_report_daily_sales'
    | 'get_report_top_products'
    | 'get_my_inventory_dashboard'
    | 'record_inventory_movement'
    | 'record_inventory_reception'
    | 'reconcile_inventory_count'
    | 'get_my_inventory_history',
  parameters: Record<string, unknown>,
  parser: (value: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), ADMIN_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal
  try {
    const { data, error } = await getSupabaseClient().rpc(rpc, parameters).abortSignal(signal)
    if (error) {
      const code = error.message
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new AdminServiceError(
          'El flujo de inventario todavía no está disponible en este entorno. Falta aplicar su contrato de servidor.',
          'INVENTORY_CONTRACT_UNAVAILABLE',
        )
      }
      if (code === 'ADMIN_UNAUTHORIZED' || code === 'User management is not allowed') {
        throw new AdminServiceError('Acceso denegado. No tienes permisos suficientes para realizar esta acción administrativa.', code)
      }
      if (code === 'Branch management is not allowed') {
        throw new AdminServiceError('No tienes permisos suficientes para administrar sucursales.', code)
      }
      if (code === 'Branch data is invalid' || code === 'BRANCH_DATA_INVALID') {
        throw new AdminServiceError('Los datos de la sucursal proporcionados no son válidos.', code)
      }
      if (code === 'Branch code is unavailable' || code === 'BRANCH_CODE_DUPLICATE') {
        throw new AdminServiceError('Ya existe otra sucursal registrada con ese código.', code)
      }
      if (code === 'Branch is unavailable') {
        throw new AdminServiceError('La sucursal especificada no existe o no está disponible.', code)
      }
      if (code === 'Branch assignment is not allowed') {
        throw new AdminServiceError('No tienes permisos suficientes para asignar sucursales.', code)
      }
      if (code === 'Target profile is unavailable' || code === 'USER_NOT_FOUND') {
        throw new AdminServiceError('El usuario especificado no existe o no está disponible.', code)
      }
      if (code === 'Target branch is unavailable' || code === 'BRANCH_NOT_FOUND') {
        throw new AdminServiceError('La sucursal especificada no existe o está inactiva.', code)
      }
      if (code === 'Role assignment is not allowed') {
        throw new AdminServiceError('No tienes permisos suficientes para asignar roles.', code)
      }
      if (code === 'ADMIN cannot grant or modify OWNER') {
        throw new AdminServiceError('Un Administrador no puede conceder ni modificar el rol de Propietario.', code)
      }
      if (code === 'The last OWNER cannot be reassigned') {
        throw new AdminServiceError('No se puede reasignar al último Propietario activo.', code)
      }
      if (code === 'ADMIN cannot modify OWNER status') {
        throw new AdminServiceError('Un Administrador no puede cambiar el estado de un Propietario.', code)
      }
      if (code === 'The last active OWNER cannot be deactivated') {
        throw new AdminServiceError('No se puede desactivar al último propietario activo.', code)
      }
      if (code === 'User data is invalid') {
        throw new AdminServiceError('Los datos del usuario no son válidos.', code)
      }
      if (code === 'ROLE_INVALID') {
        throw new AdminServiceError('El rol especificado no es válido.', code)
      }
      if (code === 'ADMIN_BRANCH_QUERY_INVALID' || code === 'ADMIN_STAFF_QUERY_INVALID') {
        throw new AdminServiceError('La consulta administrativa no es válida.', code)
      }
      if (code === 'INVENTORY_UNAUTHORIZED' || code === 'INVENTORY_BRANCH_FORBIDDEN') {
        throw new AdminServiceError('No tienes autorización para consultar o modificar este inventario.', code)
      }
      if (code === 'INVENTORY_QUERY_INVALID') {
        throw new AdminServiceError('La consulta de inventario no es válida.', code)
      }
      if (code === 'INVENTORY_RECEPTION_INVALID') {
        throw new AdminServiceError('Revisa el producto, la cantidad y las notas de la recepción.', code)
      }
      if (code === 'INVENTORY_COUNT_INVALID') {
        throw new AdminServiceError('Revisa la existencia contada y el motivo de la conciliación.', code)
      }
      if (code === 'INVENTORY_IDEMPOTENCY_CONFLICT') {
        throw new AdminServiceError('El intento seguro ya corresponde a otra operación. Actualiza Inventario antes de continuar.', code)
      }
      throw new AdminServiceError('No fue posible realizar la operación administrativa en el servidor.', code)
    }
    try {
      return parser(data)
    } catch (error) {
      throw new AdminServiceError(error instanceof Error ? error.message : 'El backend devolvió un contrato incompatible.', 'INCOMPATIBLE_RESPONSE')
    }
  } catch (error) {
    if (error instanceof AdminServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) throw new AdminServiceError('La consulta administrativa agotó el tiempo de espera.', 'TIMEOUT')
    if (callerSignal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    throw new AdminServiceError('No fue posible cargar la información administrativa.', 'UNKNOWN')
  } finally {
    clearTimeout(timeoutId)
  }
}

export function fetchAdminBranches(
  cursor: AdminBranchCursor | null,
  signal?: AbortSignal,
): Promise<AdminBranchesResponse> {
  return adminRequest('get_admin_branches', {
    p_limit: 50,
    p_after_code: cursor?.code ?? null,
    p_after_id: cursor?.id ?? null,
    p_include_inactive: true,
  }, parseAdminBranchesResponse, signal)
}

export function fetchAdminStaff(
  cursor: AdminStaffCursor | null,
  signal?: AbortSignal,
): Promise<AdminStaffResponse> {
  return adminRequest('get_admin_staff', {
    p_limit: 50,
    p_after_full_name: cursor?.fullName ?? null,
    p_after_id: cursor?.id ?? null,
    p_search: null,
    p_branch_id: null,
    p_include_inactive: true,
  }, parseAdminStaffResponse, signal)
}

export function createBranch(
  input: CreateBranchInput,
  signal?: AbortSignal,
): Promise<BranchRow> {
  const validated = validateCreateBranchInput(input.code, input.name)
  return adminRequest('create_branch', {
    p_code: validated.code,
    p_name: validated.name,
  }, parseBranchRowResponse, signal)
}

export async function updateBranch(
  input: UpdateBranchInput,
  signal?: AbortSignal,
): Promise<BranchRow> {
  const validated = validateUpdateBranchInput(input.id, input.code, input.name)
  return adminRequest('update_branch', {
    p_branch_id: validated.id,
    p_code: validated.code,
    p_name: validated.name,
  }, parseBranchRowResponse, signal)
}

export async function setBranchActive(
  id: string,
  active: boolean,
  signal?: AbortSignal,
): Promise<BranchRow> {
  return adminRequest('set_branch_active', {
    p_branch_id: id,
    p_is_active: active,
  }, parseBranchRowResponse, signal)
}

export async function assignUserBranch(
  input: AssignUserBranchInput,
  signal?: AbortSignal,
): Promise<void> {
  const validated = validateAssignUserBranchInput(input.userId, input.branchId)
  await adminRequest('assign_user_branch', {
    p_user_id: validated.userId,
    p_branch_id: validated.branchId,
  }, parseVoidResponse, signal)
}

export async function assignUserRole(
  input: AssignUserRoleInput,
  signal?: AbortSignal,
): Promise<void> {
  const validated = validateAssignUserRoleInput(input.userId, input.role)
  await adminRequest('assign_user_role', {
    p_user_id: validated.userId,
    p_role_name: validated.role,
  }, parseVoidResponse, signal)
}

export function fetchDailySalesReport(
  params: {
    branchId?: string | null
    startDate?: string | null
    endDate?: string | null
  },
  signal?: AbortSignal,
): Promise<AdminDailySaleReportItem[]> {
  return adminRequest('get_report_daily_sales', {
    p_branch_id: params.branchId ?? null,
    p_start_date: params.startDate ?? null,
    p_end_date: params.endDate ?? null,
  }, parseAdminDailySalesReport, signal)
}

export function fetchTopProductsReport(
  params: {
    branchId?: string | null
    limit?: number
  },
  signal?: AbortSignal,
): Promise<AdminTopProductReportItem[]> {
  return adminRequest('get_report_top_products', {
    p_branch_id: params.branchId ?? null,
    p_limit: params.limit ?? 10,
  }, parseAdminTopProductsReport, signal)
}

export async function fetchAdminInventoryBalances(signal?: AbortSignal): Promise<AdminInventoryBalancesResponse> {
  const items: AdminInventoryBalancesResponse['items'] = []
  let branchId: string | null = null
  let afterProductId: string | null = null
  let hasMore = false
  do {
    const page: AdminInventoryBalancesResponse = await adminRequest<AdminInventoryBalancesResponse>('get_my_inventory_dashboard', {
      p_limit: 100,
      p_after_product_id: afterProductId,
    }, parseAdminInventoryBalances, signal)
    if (branchId !== null && branchId !== page.branchId) {
      throw new AdminServiceError('El backend cambió la sucursal durante la consulta de inventario.', 'INCOMPATIBLE_RESPONSE')
    }
    branchId = page.branchId
    items.push(...page.items)
    hasMore = page.hasMore
    afterProductId = page.nextProductId
    if (hasMore && afterProductId === null) {
      throw new AdminServiceError('La paginación de inventario es incompatible.', 'INCOMPATIBLE_RESPONSE')
    }
  } while (hasMore)
  if (branchId === null) throw new AdminServiceError('El inventario no indicó una sucursal.', 'INCOMPATIBLE_RESPONSE')
  return { schemaVersion: 1, branchId, items, hasMore: false, nextProductId: null }
}

export async function fetchInventoryProductOptions(signal?: AbortSignal): Promise<AdminInventoryProductOption[]> {
  const options: AdminInventoryProductOption[] = []
  let cursor = null
  do {
    const response = await loadPublicCatalog({ search: '', categoryId: null, cursor, limit: 50 }, signal)
    options.push(...response.items.map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.price.unit,
    })))
    cursor = response.page.nextCursor
  } while (cursor !== null)
  return options
}

export async function recordInventoryReception(
  input: RecordInventoryReceptionInput,
  signal?: AbortSignal,
): Promise<InventoryOperationResult> {
  const validated = validateInventoryReceptionInput(input.productId, input.quantity, input.notes ?? '', input.idempotencyKey)
  return adminRequest('record_inventory_reception', {
    p_product_id: validated.productId,
    p_quantity: validated.quantity,
    p_notes: validated.notes,
    p_idempotency_key: validated.idempotencyKey,
  }, parseInventoryReceptionResult, signal)
}

export async function reconcileInventoryCount(
  input: ReconcileInventoryCountInput,
  signal?: AbortSignal,
): Promise<InventoryOperationResult> {
  const validated = validateInventoryCountInput(input.productId, input.countedQuantity, input.reason, input.idempotencyKey)
  return adminRequest('reconcile_inventory_count', {
    p_product_id: validated.productId,
    p_counted_quantity: validated.countedQuantity,
    p_reason: validated.reason,
    p_idempotency_key: validated.idempotencyKey,
    p_location_id: null,
  }, parseInventoryCountResult, signal)
}

export async function fetchInventoryHistory(productId: string, signal?: AbortSignal): Promise<InventoryHistoryResponse> {
  return adminRequest('get_my_inventory_history', {
    p_product_id: productId,
    p_limit: 50,
    p_after_created_at: null,
    p_after_id: null,
  }, parseInventoryHistory, signal)
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const validated = validateSetUserActiveInput(userId, isActive)
  await adminRequest('set_user_active', {
    p_user_id: validated.userId,
    p_is_active: validated.isActive,
  }, parseVoidResponse, signal)
}
