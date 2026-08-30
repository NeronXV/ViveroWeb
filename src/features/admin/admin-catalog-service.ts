import { getSupabaseClient } from '../../lib/supabase/client'
import { AdminServiceError } from './admin-service'
import {
  parseAdminCategories,
  parseAdminProducts,
  parseAdminProduct,
  parseAdminCategory,
} from './admin-catalog-parser'
import type {
  AdminCategory,
  AdminProduct,
  UpsertCategoryInput,
  UpsertProductInput,
} from './admin-catalog-types'

const CATALOG_TIMEOUT_MS = 8_000
const ADMIN_PRODUCT_COLUMNS = [
  'id',
  'internal_code',
  'barcode',
  'common_name',
  'scientific_name',
  'description',
  'category_id',
  'price_cents',
  'wholesale_price_cents',
  'unit',
  'minimum_stock',
  'watering_advice',
  'light_type',
  'recommended_climate',
  'is_active',
  'created_at',
  'updated_at',
  'categories(name)',
].join(',')
const ADMIN_CATEGORY_COLUMNS = 'id,name,description,is_active,created_at,updated_at'

async function catalogRequest<T>(
  action: (signal: AbortSignal) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>,
  parser: (data: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), CATALOG_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal

  try {
    const { data, error } = await action(signal)
    if (error) {
      const code = error.message || error.code || 'UNKNOWN'
      if (code === 'Product management is not allowed' || error.code === '42501') {
        throw new AdminServiceError('Acceso denegado. No tienes permisos para administrar productos o categorías.', 'UNAUTHORIZED')
      }
      if (code === 'Price management is not allowed') {
        throw new AdminServiceError('No tienes permisos suficientes para modificar los precios de los productos.', 'UNAUTHORIZED_PRICES')
      }
      if (code === 'Price management is required for new products') {
        throw new AdminServiceError('Se requiere el permiso de precios para crear nuevos productos.', 'UNAUTHORIZED_PRICES')
      }
      if (code === 'Code or barcode is already in use' || error.code === '23505') {
        throw new AdminServiceError('El código interno o código de barras ya se encuentra registrado en otro producto.', 'CODE_DUPLICATE')
      }
      throw new AdminServiceError('No fue posible completar la operación de catálogo en el servidor.', error.code || 'SERVER_ERROR')
    }

    try {
      return parser(data)
    } catch (parseError) {
      throw new AdminServiceError(
        parseError instanceof Error ? parseError.message : 'El backend devolvió un contrato incompatible.',
        'INCOMPATIBLE_RESPONSE'
      )
    }
  } catch (error) {
    if (error instanceof AdminServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new AdminServiceError('La operación de catálogo agotó el tiempo de espera.', 'TIMEOUT')
    }
    if (callerSignal?.aborted) {
      throw new DOMException('Operación cancelada.', 'AbortError')
    }
    throw new AdminServiceError('No fue posible realizar la operación del catálogo.', 'UNKNOWN')
  } finally {
    clearTimeout(timeoutId)
  }
}

export function fetchAdminProducts(
  params: {
    search?: string
    categoryId?: string | null
    status?: 'all' | 'active' | 'inactive'
  },
  signal?: AbortSignal,
): Promise<AdminProduct[]> {
  return catalogRequest(
    async (requestSignal) => {
      const client = getSupabaseClient()
      let query = client.from('products').select(ADMIN_PRODUCT_COLUMNS)

      if (params.search) {
        const searchPattern = `%${params.search.trim()}%`
        query = query.or(`common_name.ilike.${searchPattern},internal_code.ilike.${searchPattern},scientific_name.ilike.${searchPattern}`)
      }

      if (params.categoryId) {
        query = query.eq('category_id', params.categoryId)
      }

      if (params.status === 'active') {
        query = query.eq('is_active', true)
      } else if (params.status === 'inactive') {
        query = query.eq('is_active', false)
      }

      query = query.order('common_name')

      return query.abortSignal(requestSignal)
    },
    parseAdminProducts,
    signal
  )
}

export function fetchAdminCategories(signal?: AbortSignal): Promise<AdminCategory[]> {
  return catalogRequest(
    async (requestSignal) => {
      const query = getSupabaseClient().from('categories').select(ADMIN_CATEGORY_COLUMNS).order('name')
      return query.abortSignal(requestSignal)
    },
    parseAdminCategories,
    signal
  )
}

export function upsertProduct(
  input: UpsertProductInput,
  signal?: AbortSignal,
): Promise<AdminProduct> {
  return catalogRequest(
    async (requestSignal) => {
      const query = getSupabaseClient().rpc('upsert_product', {
        p_id: input.id ?? null,
        p_internal_code: input.internalCode.trim(),
        p_barcode: input.barcode?.trim() || null,
        p_common_name: input.commonName.trim(),
        p_scientific_name: input.scientificName?.trim() || null,
        p_description: input.description?.trim() || '',
        p_category_id: input.categoryId,
        p_price_cents: input.priceCents,
        p_wholesale_price_cents: input.wholesalePriceCents,
        p_unit: input.unit,
        p_minimum_stock: input.minimumStock,
        p_watering_advice: input.wateringAdvice?.trim() || '',
        p_light_type: input.lightType?.trim() || '',
        p_recommended_climate: input.recommendedClimate?.trim() || '',
        p_is_active: input.isActive,
      })

      return query.abortSignal(requestSignal)
    },
    parseAdminProduct,
    signal
  )
}

export function upsertCategory(
  input: UpsertCategoryInput,
  signal?: AbortSignal,
): Promise<AdminCategory> {
  return catalogRequest(
    async (requestSignal) => {
      const query = getSupabaseClient().rpc('upsert_category', {
        p_id: input.id ?? null,
        p_name: input.name.trim(),
        p_description: input.description?.trim() || null,
        p_is_active: input.isActive,
      })

      return query.abortSignal(requestSignal)
    },
    parseAdminCategory,
    signal
  )
}

export function setProductImagePrimary(
  imageId: string,
  signal?: AbortSignal,
): Promise<void> {
  return catalogRequest(
    async (requestSignal) => {
      const query = getSupabaseClient().rpc('set_product_image_primary', {
        p_image_id: imageId,
      })

      return query.abortSignal(requestSignal)
    },
    () => {},
    signal
  )
}
