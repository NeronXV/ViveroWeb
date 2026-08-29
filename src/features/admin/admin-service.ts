import { getSupabaseClient } from '../../lib/supabase/client'
import {
  parseAdminBranchesResponse,
  parseAdminStaffResponse,
  parseCreateBranchResponse,
  parseVoidResponse,
  validateAssignUserBranchInput,
  validateAssignUserRoleInput,
  validateCreateBranchInput,
  validateUpdateBranchInput,
  parseAdminDailySalesReport,
  parseAdminTopProductsReport,
} from './admin-parser'
import type {
  AdminBranchCursor,
  AdminBranchesResponse,
  AdminStaffCursor,
  AdminStaffResponse,
  AssignUserBranchInput,
  AssignUserRoleInput,
  CreateBranchInput,
  UpdateBranchInput,
  AdminDailySaleReportItem,
  AdminTopProductReportItem,
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
    | 'get_report_daily_sales'
    | 'get_report_top_products',
  parameters: Record<string, unknown>,
  parser: (value: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), ADMIN_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal
  try {
    const { data, error } = await getSupabaseClient().rpc(rpc, parameters).abortSignal(signal)
    if (error) {
      const code = error.message
      if (code === 'ADMIN_UNAUTHORIZED') {
        throw new AdminServiceError('Acceso denegado. No tienes permisos suficientes para realizar esta acción administrativa.', code)
      }
      if (code === 'BRANCH_CODE_DUPLICATE') {
        throw new AdminServiceError('Ya existe otra sucursal registrada con ese código.', code)
      }
      if (code === 'BRANCH_DATA_INVALID') {
        throw new AdminServiceError('Los datos de la sucursal proporcionados no son válidos.', code)
      }
      if (code === 'USER_NOT_FOUND') {
        throw new AdminServiceError('El usuario especificado no existe o no tiene un perfil administrativo activo.', code)
      }
      if (code === 'BRANCH_NOT_FOUND') {
        throw new AdminServiceError('La sucursal especificada no existe o está inactiva.', code)
      }
      if (code === 'ROLE_INVALID') {
        throw new AdminServiceError('El rol especificado no es válido.', code)
      }
      if (code === 'ADMIN_BRANCH_QUERY_INVALID' || code === 'ADMIN_STAFF_QUERY_INVALID') {
        throw new AdminServiceError('La consulta administrativa no es válida.', code)
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
    window.clearTimeout(timeoutId)
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
): Promise<string> {
  const validated = validateCreateBranchInput(input.code, input.name)
  return adminRequest('create_branch', {
    p_code: validated.code,
    p_name: validated.name,
  }, parseCreateBranchResponse, signal)
}

export async function updateBranch(
  input: UpdateBranchInput,
  signal?: AbortSignal,
): Promise<void> {
  const validated = validateUpdateBranchInput(input.id, input.code, input.name)
  await adminRequest('update_branch', {
    p_id: validated.id,
    p_code: validated.code,
    p_name: validated.name,
  }, parseVoidResponse, signal)
}

export async function setBranchActive(
  id: string,
  active: boolean,
  signal?: AbortSignal,
): Promise<void> {
  await adminRequest('set_branch_active', {
    p_id: id,
    p_active: active,
  }, parseVoidResponse, signal)
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
    p_role: validated.role,
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

