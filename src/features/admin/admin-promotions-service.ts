import { backendId } from '../auth/backend-runtime'
import { backendHttp, BackendHttpError, apiId, list, utc } from '../../lib/backend-http'
import { AdminServiceError } from './admin-service'
import type { AdminPromotion, UpsertCatalogPromotionInput } from './admin-promotions-types'
function money(v: unknown, nullable = false): number | null {
  if (nullable && v === null) return null
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('Invalid money')
  return v
}
function text(v: unknown): string { if (typeof v !== 'string') throw new Error('Invalid text'); return v }
function parse(row: Record<string, unknown>): AdminPromotion {
  if (!['ALL_PRODUCTS', 'SELECTED_PRODUCTS'].includes(String(row.scope)) || !['PERCENTAGE', 'FIXED_AMOUNT'].includes(String(row.promo_type)) || typeof row.is_active !== 'boolean' || !Array.isArray(row.product_ids)) throw new Error('Invalid promotion')
  const percent = row.promo_type === 'PERCENTAGE'
  if (percent ? !Number.isInteger(row.percentage_bps) || Number(row.percentage_bps) < 1 || Number(row.percentage_bps) > 10000 || row.fixed_amount_cents !== null : row.percentage_bps !== null || Number(money(row.fixed_amount_cents)) < 1) throw new Error('Invalid discount')
  return { id: apiId(row.id), name: text(row.name), description: text(row.description) || null, scope: row.scope as AdminPromotion['scope'], promoType: row.promo_type as AdminPromotion['promoType'],
    value: percent ? Number(row.percentage_bps) / 100 : Number(money(row.fixed_amount_cents)), minPurchaseCents: money(row.min_purchase_cents), maxDiscountCents: money(row.max_discount_cents, true),
    startsAt: row.starts_at === null ? null : utc(row.starts_at), endsAt: row.ends_at === null ? null : utc(row.ends_at), isActive: row.is_active,
    productIds: row.product_ids.map(apiId), createdAt: utc(row.created_at), updatedAt: utc(row.updated_at) }
}
async function safe<T>(action: () => Promise<T>, signal?: AbortSignal) {
  try { return await action() } catch (error) {
    if (signal?.aborted) throw new DOMException('Operación cancelada.', 'AbortError')
    if (error instanceof BackendHttpError) throw new AdminServiceError(error.message, error.code)
    throw new AdminServiceError('No se confirmó la promoción. Revisa los datos y actualiza la lista.', 'INCOMPATIBLE_RESPONSE')
  }
}
export function fetchAdminPromotions(signal?: AbortSignal): Promise<AdminPromotion[]> {
  return safe(async () => {
    const result: AdminPromotion[] = []; let after = 0
    do {
      const data = await backendHttp('promotions?limit=100' + (after ? '&after_id=' + after : ''), 'GET', undefined, signal)
      const rows = list(data.items).map(parse)
      for (const row of rows) { const id = Number(row.id); if (id <= after) throw new Error('Invalid order'); after = id; result.push(row) }
      if (data.next_after_id === null) break
      if (data.next_after_id !== after || rows.length !== 100) throw new Error('Invalid cursor')
    } while (after < 4294967295)
    return result
  }, signal)
}
export function upsertCatalogPromotion(input: UpsertCatalogPromotionInput, signal?: AbortSignal): Promise<void> {
  return safe(async () => {
    const percent = input.promoType === 'PERCENTAGE', value = String(input.value), match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
    if (!match) throw new Error('Invalid amount')
    const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
    const id = input.id ? backendId(input.id) : null
    const result = await backendHttp(id ? 'promotions/' + id : 'promotions', id ? 'PUT' : 'POST', {
      name: input.name.trim(), description: input.description?.trim() || '', scope: input.scope, promo_type: input.promoType,
      percentage_bps: percent ? bps : null, fixed_amount_cents: percent ? null : input.value,
      min_purchase_cents: input.minPurchaseCents ?? 0, max_discount_cents: input.maxDiscountCents ?? null, starts_at: input.startsAt ?? null, ends_at: input.endsAt ?? null,
      is_active: input.isActive, product_ids: input.scope === 'ALL_PRODUCTS' ? [] : input.productIds.map(backendId),
    }, signal)
    const saved = apiId(result.id); if (id !== null && Number(saved) !== id) throw new Error('Wrong promotion')
  }, signal)
}
