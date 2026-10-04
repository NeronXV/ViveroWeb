import { backendHttp, apiId, object, list, utc, decimal } from '../../lib/backend-http'
import { backendId, backendKey } from '../auth/backend-runtime'

type Params = Record<string, unknown>
const id = (value: unknown) => backendId(String(value))
const role = (r: Record<string, unknown>) => r.role_name === null ? null : { name: r.role_name, displayName: r.role_display_name }
const branchRow = (r: Record<string, unknown>) => ({ id: apiId(r.id), code: r.code, name: r.name, is_active: r.is_active, created_at: utc(r.created_at), updated_at: utc(r.updated_at) })
export async function backendAdminRequest(operation: string, p: Params, signal?: AbortSignal): Promise<unknown> {
  const call = (path: string, method = 'GET', body?: unknown, key?: string) => backendHttp(path, method, body, signal, key)
  const now = new Date().toISOString()
  const query = new URLSearchParams({ limit: String(p.p_limit ?? 50) })
  if (p.p_after_id) query.set('after_id', String(id(p.p_after_id)))
  if (operation === 'get_admin_branches' || operation === 'get_admin_staff') {
    query.set('include_inactive', 'true')
    const staff = operation === 'get_admin_staff'
    const r = await call(`admin/${staff ? 'staff' : 'branches'}?${query}`)
    const items = list(r.items).map(row => staff ? {
      id: apiId(row.id), fullName: row.full_name, isActive: row.is_active, updatedAt: utc(row.updated_at), role: role(row),
      branch: row.branch_id === null ? null : { id: apiId(row.branch_id), code: row.branch_code, name: row.branch_name, isActive: row.branch_active },
    } : { id: apiId(row.id), code: row.code, name: row.name, isActive: row.is_active, updatedAt: utc(row.updated_at), activeStaffCount: row.active_staff_count, pendingSaleCount: row.pending_sale_count })
    return { schemaVersion: 1, items, serverTime: now, page: { limit: p.p_limit ?? 50, hasMore: r.next_after_id !== null,
      nextCursor: r.next_after_id === null ? null : staff ? { id: apiId(r.next_after_id), fullName: 'id' } : { id: apiId(r.next_after_id), code: 'ID' } } }
  }
  if (['create_branch', 'update_branch', 'set_branch_active'].includes(operation)) {
    const path = operation === 'create_branch' ? 'admin/branches' : `admin/branches/${id(p.p_branch_id)}${operation === 'set_branch_active' ? '/active' : ''}`
    const r = await call(path, operation === 'create_branch' ? 'POST' : 'PATCH', operation === 'set_branch_active' ? { is_active: p.p_is_active } : { code: p.p_code, name: p.p_name })
    return branchRow(object(r.branch))
  }
  if (operation === 'get_admin_role_options') {
    const r = await call('admin/roles')
    return { schemaVersion: 1, actorRole: r.actor_role, items: list(r.items).map(row => ({ name: row.name, displayName: row.display_name, capabilities: row.capabilities })), serverTime: now }
  }
  if (['assign_user_branch', 'assign_user_role', 'set_admin_staff_role', 'set_user_active'].includes(operation)) {
    const action = operation === 'assign_user_branch' ? 'branch' : operation === 'set_user_active' ? 'active' : 'role'
    const r = await call(`admin/staff/${id(p.p_user_id)}/${action}`, 'PATCH', action === 'branch' ? { branch_id: id(p.p_branch_id) } : action === 'active' ? { is_active: p.p_is_active } : { role_name: p.p_role_name })
    if (operation !== 'set_admin_staff_role') return null
    const row = object(r.staff)
    return { schemaVersion: 1, userId: apiId(row.id), role: role(row), updatedAt: utc(row.updated_at), serverTime: now }
  }
  if (operation.startsWith('get_report_')) {
    const params = new URLSearchParams()
    for (const key of ['branch_id', 'start_date', 'end_date', 'limit']) if (p['p_' + key] != null) params.set(key, String(p['p_' + key]))
    const top = operation === 'get_report_top_products'
    const r = await call(`reports/${top ? 'top-products' : 'daily-sales'}?${params}`)
    return list(r.items).map(row => top ? { productId: apiId(row.product_id), productName: row.product_name, productCode: row.product_code, totalQuantity: decimal(row.total_quantity), totalRevenueCents: row.total_revenue_cents }
      : { branchId: apiId(row.branch_id), branchName: row.branch_name, day: row.day, salesCount: row.sales_count, revenueCents: row.revenue_cents, discountCents: row.discount_cents })
  }
  if (operation === 'get_my_inventory_dashboard' || operation === 'get_admin_inventory_balances') {
    const params = new URLSearchParams({ limit: String(p.p_limit ?? 100) })
    if (p.p_after_product_id) params.set('after_product_id', String(id(p.p_after_product_id)))
    const r = await call('inventory/dashboard?' + params)
    return { schemaVersion: 1, branchId: apiId(r.branch_id), hasMore: r.has_more, nextProductId: r.next_product_id === null ? null : apiId(r.next_product_id),
      items: list(r.items).map(row => ({ productId: apiId(row.product_id), productName: row.product_name, productCode: row.product_code, productUnit: row.product_unit,
        totalQuantity: decimal(row.total_quantity), minimumStock: decimal(row.minimum_stock), isLowStock: row.is_low_stock,
        balanceUpdatedAt: row.balance_updated_at === null ? null : utc(row.balance_updated_at) })) }
  }
  if (operation === 'get_my_inventory_history') {
    const r = await call(`inventory/history?limit=50&product_id=${id(p.p_product_id)}`)
    return { schemaVersion: 1, branchId: apiId(r.branch_id), hasMore: r.has_more,
      nextCursor: r.next_before_id === null ? null : { id: apiId(r.next_before_id), createdAt: utc(list(r.items).at(-1)?.created_at) },
      items: list(r.items).map(row => ({ id: apiId(row.id), productId: apiId(row.product_id), productName: row.product_name, productCode: row.product_code,
        movementType: row.movement_type, quantity: decimal(row.quantity), notes: row.notes, createdAt: utc(row.created_at), createdByLabel: row.created_by_label })) }
  }
  if (operation === 'record_inventory_reception' || operation === 'reconcile_inventory_count') {
    const count = operation === 'reconcile_inventory_count'
    const r = await call(`inventory/${count ? 'counts' : 'receptions'}`, 'POST', count ? { product_id: id(p.p_product_id), counted_quantity: String(p.p_counted_quantity), reason: p.p_reason }
      : { product_id: id(p.p_product_id), quantity: String(p.p_quantity), notes: p.p_notes }, await backendKey(String(p.p_idempotency_key), 'inventory'))
    return { schemaVersion: 1, idempotentReplay: r.idempotent_replay, productId: apiId(r.product_id), totalQuantity: decimal(r.total_quantity), ...(count
      ? { countId: apiId(r.count_id), previousQuantity: decimal(r.previous_quantity), countedQuantity: decimal(r.counted_quantity), adjustmentQuantity: decimal(r.adjustment_quantity) }
      : { movementId: apiId(r.movement_id), quantity: decimal(r.quantity) }) }
  }
  throw new Error('Operación administrativa sin contrato API.')
}
