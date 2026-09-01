import { getSupabaseClient } from '../../lib/supabase/client'
import { AdminServiceError } from './admin-service'
import type { AdminPromotion, UpsertCatalogPromotionInput } from './admin-promotions-types'

const PROMOTIONS_TIMEOUT_MS = 8_000

async function promotionRequest<T>(
  action: (signal: AbortSignal) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>,
  parser: (data: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), PROMOTIONS_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal

  try {
    const { data, error } = await action(signal)
    if (error) {
      throw new AdminServiceError(error.message || 'Error en el servicio de promociones.', error.code)
    }
    return parser(data)
  } catch (error) {
    if (error instanceof AdminServiceError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AdminServiceError('La solicitud excedió el tiempo límite de espera.', 'TIMEOUT')
    }
    throw new AdminServiceError('Ocurrió un error inesperado al gestionar la promoción.', 'UNKNOWN')
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchAdminPromotions(callerSignal?: AbortSignal): Promise<AdminPromotion[]> {
  return promotionRequest(
    async (signal) => {
      const client = getSupabaseClient()
      const query = client
        .from('promotions')
        .select('*, promotion_products(product_id)')
        .order('created_at', { ascending: false })

      return query.abortSignal(signal)
    },
    (data) => {
      if (!Array.isArray(data)) return []
      return data.map((row: Record<string, unknown>) => {
        const productIds = Array.isArray(row.promotion_products)
          ? (row.promotion_products as Record<string, unknown>[]).map((p) => String(p.product_id || ''))
          : []
        return {
          id: String(row.id),
          name: String(row.name || ''),
          description: row.description ? String(row.description) : null,
          scope: (row.scope === 'ALL_PRODUCTS' || row.scope === 'SELECTED_PRODUCTS') ? row.scope : 'ALL_PRODUCTS',
          promoType: row.promo_type === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE',
          value: Number(row.value) || 0,
          minPurchaseCents: row.min_purchase_cents !== null && row.min_purchase_cents !== undefined ? Number(row.min_purchase_cents) : null,
          maxDiscountCents: row.max_discount_cents !== null && row.max_discount_cents !== undefined ? Number(row.max_discount_cents) : null,
          startsAt: row.starts_at ? String(row.starts_at) : null,
          endsAt: row.ends_at ? String(row.ends_at) : null,
          isActive: Boolean(row.is_active),
          productIds,
          createdAt: row.created_at ? String(row.created_at) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
        }
      })
    },
    callerSignal
  )
}

export async function upsertCatalogPromotion(
  input: UpsertCatalogPromotionInput,
  callerSignal?: AbortSignal,
): Promise<void> {
  return promotionRequest(
    async (signal) => {
      const client = getSupabaseClient()
      const query = client.rpc('upsert_catalog_promotion', {
        p_id: input.id ?? null,
        p_name: input.name.trim(),
        p_description: input.description?.trim() || null,
        p_scope: input.scope,
        p_promo_type: input.promoType,
        p_value: input.value,
        p_min_purchase_cents: input.minPurchaseCents ?? null,
        p_max_discount_cents: input.maxDiscountCents ?? null,
        p_starts_at: input.startsAt ?? null,
        p_ends_at: input.endsAt ?? null,
        p_is_active: input.isActive,
        p_product_ids: input.scope === 'ALL_PRODUCTS' ? [] : input.productIds,
      })

      return query.abortSignal(signal)
    },
    () => {},
    callerSignal
  )
}
