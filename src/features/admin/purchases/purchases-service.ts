import { getSupabaseClient } from '../../../lib/supabase/client'
import {
  parseSupplier,
  parseSupplierPurchaseDetail,
  parseSupplierPurchasesResponse,
} from './purchases-parser'
import type {
  ConfirmPurchaseInput,
  CreatePurchaseDraftInput,
  PurchaseStatus,
  ResolvePurchaseItemInput,
  SetSupplierPresentationInput,
  Supplier,
  SupplierPurchaseDetail,
  SupplierPurchasesResponse,
  UpsertSupplierInput,
} from './purchases-types'

const PURCHASES_TIMEOUT_MS = 10_000

export class PurchaseServiceError extends Error {
  code: string
  isBackendUnavailable: boolean

  constructor(message: string, code: string = 'UNKNOWN', isBackendUnavailable: boolean = false) {
    super(message)
    this.name = 'PurchaseServiceError'
    this.code = code
    this.isBackendUnavailable = isBackendUnavailable
  }
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
  SUPPLIER_MANAGEMENT_UNAUTHORIZED: 'No tienes autorización para administrar proveedores.',
  SUPPLIER_INPUT_INVALID: 'Los datos del proveedor no son válidos. Verifica el código y nombre.',
  SUPPLIER_CODE_IN_USE: 'El código de proveedor ya está en uso por otro registro.',
  PURCHASE_MANAGEMENT_UNAUTHORIZED: 'No tienes autorización para gestionar compras o inventario.',
  PURCHASE_DRAFT_INVALID: 'Los datos del borrador de compra son incorrectos.',
  PURCHASE_LINE_DUPLICATE: 'Existen renglones duplicados en la compra.',
  PURCHASE_LINE_INVALID: 'Uno o más renglones contienen valores inválidos.',
  PURCHASE_TOTAL_MISMATCH: 'El total esperado no coincide con la suma de los renglones.',
  PURCHASE_REFERENCE_IN_USE: 'La referencia o folio externo ya fue registrada para este proveedor.',
  PURCHASE_IDEMPOTENCY_CONFLICT: 'Conflicto de idempotencia al procesar la compra.',
  PURCHASE_QUERY_INVALID: 'Parámetros de consulta no válidos.',
  PURCHASE_NOT_FOUND: 'No se encontró el documento de compra especificado.',
  PURCHASE_ITEM_NOT_FOUND: 'No se encontró el renglón de compra especificado.',
  PURCHASE_ITEM_RESOLUTION_INVALID: 'La resolución del renglón no es válida.',
  SUPPLIER_PRESENTATION_INVALID: 'La configuración de presentación del proveedor contiene datos inválidos.',
  PURCHASE_NOT_READY: 'La compra no está lista para ser confirmada. Revisa que todos los renglones estén resueltos.',
  PURCHASE_CONFIRMATION_CONFLICT: 'Conflicto al confirmar la recepción de la compra.',
  PURCHASE_MOVEMENT_CONFLICT: 'No fue posible registrar los movimientos de inventario.',
  PURCHASE_PRODUCT_UNAVAILABLE: 'El producto seleccionado no está disponible o está inactivo.',
}

export function mapBackendError(rawError: { message?: string; code?: string; details?: string } | null | undefined): PurchaseServiceError {
  if (!rawError) {
    return new PurchaseServiceError('Ocurrió un error inesperado en la operación.', 'UNKNOWN')
  }

  const rawMessage = rawError.message || ''
  const rawCode = rawError.code || ''
  const combined = `${rawCode} ${rawMessage} ${rawError.details || ''}`

  // Check if RPC function is missing / migrations not applied
  if (
    rawCode === 'PGRST202' ||
    rawCode === '404' ||
    /function\s+.*does not exist/i.test(combined) ||
    /could not find the function/i.test(combined) ||
    /schema cache/i.test(combined)
  ) {
    return new PurchaseServiceError(
      'El backend de Compras y proveedores todavía no está disponible en este entorno. Aplica las migraciones autoritativas de ViveroApp y vuelve a intentar.',
      'BACKEND_UNAVAILABLE',
      true
    )
  }

  // Check mapped known error codes
  for (const [key, msg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (combined.includes(key)) {
      return new PurchaseServiceError(msg, key)
    }
  }

  // Security / Permissions
  if (rawCode === '42501' || combined.includes('not allowed') || combined.includes('permission denied')) {
    return new PurchaseServiceError('No tienes permisos suficientes para realizar esta acción.', 'UNAUTHORIZED')
  }

  return new PurchaseServiceError('No fue posible completar la operación en el servidor.', rawCode || 'UNKNOWN')
}

async function executeRpc<T>(
  action: (signal: AbortSignal) => Promise<{ data: unknown; error: { message: string; code?: string; details?: string } | null }>,
  parser: (data: unknown) => T,
  callerSignal?: AbortSignal,
): Promise<T> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), PURCHASES_TIMEOUT_MS)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutController.signal]) : timeoutController.signal

  try {
    const { data, error } = await action(signal)
    if (error) {
      throw mapBackendError(error)
    }

    try {
      return parser(data)
    } catch (parseError) {
      throw new PurchaseServiceError(
        parseError instanceof Error ? parseError.message : 'El backend devolvió un contrato incompatible.',
        'INCOMPATIBLE_RESPONSE'
      )
    }
  } catch (error) {
    if (error instanceof PurchaseServiceError) throw error
    if (signal.aborted && !callerSignal?.aborted) {
      throw new PurchaseServiceError('La operación agotó el tiempo de espera.', 'TIMEOUT')
    }
    if (callerSignal?.aborted) {
      throw new DOMException('Operación cancelada.', 'AbortError')
    }
    throw new PurchaseServiceError('No fue posible conectar con el servicio.', 'NETWORK_ERROR')
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function upsertSupplier(
  input: UpsertSupplierInput,
  signal?: AbortSignal,
): Promise<Supplier> {
  const client = getSupabaseClient()
  return executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('upsert_supplier', {
        p_code: input.code.trim().toUpperCase(),
        p_name: input.name.trim(),
        p_id: input.id ?? null,
      }).abortSignal(reqSignal)
      return res
    },
    (data) => {
      // Backend may return the supplier object or id
      if (typeof data === 'string') {
        return { id: data, code: input.code.trim().toUpperCase(), name: input.name.trim() }
      }
      return parseSupplier(data)
    },
    signal
  )
}

export async function createSupplierPurchaseDraft(
  input: CreatePurchaseDraftInput,
  signal?: AbortSignal,
): Promise<SupplierPurchaseDetail> {
  const client = getSupabaseClient()
  const createdId = await executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('create_supplier_purchase_draft', {
        p_supplier_id: input.supplierId,
        p_document_date: input.documentDate,
        p_external_reference: input.externalReference?.trim() || null,
        p_payment_terms: input.paymentTerms,
        p_expected_total_cents: input.expectedTotalCents,
        p_source_file_name: input.sourceFileName?.trim() || null,
        p_items: input.items.map((it) => ({
          lineNumber: it.lineNumber,
          rawDescription: it.rawDescription.trim(),
          containerCode: it.containerCode.trim().toUpperCase(),
          suggestedCommonName: it.suggestedCommonName?.trim() || null,
          suggestedPresentation: it.suggestedPresentation?.trim() || null,
          quantity: it.quantity,
          unitCostCents: it.unitCostCents,
        })),
        p_idempotency_key: input.idempotencyKey,
      }).abortSignal(reqSignal)
      return res
    },
    (data) => {
      if (typeof data === 'string') return data
      if (data && typeof (data as { id?: unknown }).id === 'string') {
        return (data as { id: string }).id
      }
      return null
    },
    signal
  )

  if (!createdId) {
    throw new PurchaseServiceError('No se recibió el identificador del borrador creado.', 'INVALID_DRAFT_RESPONSE')
  }

  // Load authoritative detail
  return fetchSupplierPurchaseDetail(createdId, signal)
}

export async function fetchSupplierPurchases(
  params: {
    status?: PurchaseStatus | null
    limit?: number
  } = {},
  signal?: AbortSignal,
): Promise<SupplierPurchasesResponse> {
  const client = getSupabaseClient()
  return executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('get_my_supplier_purchases', {
        p_status: params.status ?? null,
        p_limit: params.limit ?? 50,
      }).abortSignal(reqSignal)
      return res
    },
    parseSupplierPurchasesResponse,
    signal
  )
}

export async function fetchSupplierPurchaseDetail(
  purchaseId: string,
  signal?: AbortSignal,
): Promise<SupplierPurchaseDetail> {
  const client = getSupabaseClient()
  return executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('get_supplier_purchase', {
        p_purchase_id: purchaseId,
      }).abortSignal(reqSignal)
      return res
    },
    parseSupplierPurchaseDetail,
    signal
  )
}

export async function setSupplierPresentation(
  input: SetSupplierPresentationInput,
  signal?: AbortSignal,
): Promise<void> {
  const client = getSupabaseClient()
  return executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('set_supplier_presentation', {
        p_supplier_id: input.supplierId,
        p_code: input.code.trim().toUpperCase(),
        p_display_name: input.displayName.trim(),
        p_nominal_size: input.nominalSize,
        p_size_unit: input.sizeUnit,
        p_notes: input.notes?.trim() || null,
      }).abortSignal(reqSignal)
      return res
    },
    () => {},
    signal
  )
}

export async function resolveSupplierPurchaseItem(
  input: ResolvePurchaseItemInput,
  signal?: AbortSignal,
): Promise<void> {
  const client = getSupabaseClient()
  return executeRpc(
    async (reqSignal) => {
      const res = await client.rpc('resolve_supplier_purchase_item', {
        p_item_id: input.itemId,
        p_resolution: input.resolution,
        p_product_id: input.resolution === 'MATCHED' ? input.productId : null,
        p_normalized_name: input.normalizedName?.trim() || null,
        p_presentation: input.presentation?.trim() || null,
      }).abortSignal(reqSignal)
      return res
    },
    () => {},
    signal
  )
}

export async function confirmSupplierPurchase(
  input: ConfirmPurchaseInput,
  signal?: AbortSignal,
): Promise<SupplierPurchaseDetail> {
  const client = getSupabaseClient()
  try {
    await executeRpc(
      async (reqSignal) => {
        const res = await client.rpc('confirm_supplier_purchase', {
          p_purchase_id: input.purchaseId,
          p_confirmation_key: input.confirmationKey,
        }).abortSignal(reqSignal)
        return res
      },
      () => {},
      signal
    )
  } catch (err) {
    // If confirmation failed or had network uncertainty, verify authoritative status
    try {
      const verified = await fetchSupplierPurchaseDetail(input.purchaseId, signal)
      if (verified.status === 'RECEIVED') {
        return verified
      }
    } catch {
      // Re-throw original error if inspection fails
    }
    throw err
  }

  // Reload authoritative received purchase detail
  return fetchSupplierPurchaseDetail(input.purchaseId, signal)
}
