import { apiId, backendHttp, BackendHttpError, list, object, utc } from '../../../lib/backend-http'
import { backendId, requireBackendAccess } from '../../auth/backend-runtime'
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
  PURCHASE_ATTEMPT_RETIRED: 'Este intento ya fue resuelto. Puedes corregir los datos y crear otro borrador.',
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

async function request<T>(action: () => Promise<T>): Promise<T> {
  try { return await action() } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (error instanceof PurchaseServiceError) throw error
    if (error instanceof BackendHttpError) throw mapBackendError({ code: error.code })
    throw new PurchaseServiceError('El servidor devolvió una respuesta incompatible.', 'INCOMPATIBLE_RESPONSE')
  }
}
const id = (value: string) => backendId(value)
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid amount')
  return value
}
function header(row: Record<string, unknown>) {
  const supplier = object(row.supplier)
  if (!['DRAFT', 'RECEIVED', 'CANCELLED'].includes(String(row.status)) || !['CASH', 'CREDIT', 'OTHER'].includes(String(row.payment_terms)) || typeof row.document_date !== 'string') throw new Error('Invalid purchase')
  return { ...row, id: apiId(row.id), supplier: { ...supplier, id: apiId(supplier.id) },
    document_date: row.document_date.slice(0, 10), expected_total_cents: amount(row.expected_total_cents),
    item_count: amount(row.item_count), unmatched_count: amount(row.unmatched_count),
    created_at: utc(row.created_at), received_at: row.received_at === null ? null : utc(row.received_at) }
}
function detail(root: Record<string, unknown>): SupplierPurchaseDetail {
  if (root.schema_version !== 1) throw new Error('Invalid version')
  const row = object(root.purchase)
  const items = list(row.items).map(item => {
    if (!['UNMATCHED', 'AUTO_MATCHED', 'MATCHED', 'IGNORED'].includes(String(item.resolution_status))) throw new Error('Invalid resolution')
    return { ...item, id: apiId(item.id), product_id: item.product_id === null ? null : apiId(item.product_id),
      resolution_status: item.resolution_status, container_code: item.supplier_container_code, quantity: amount(item.quantity), unit_cost_cents: amount(item.unit_cost_cents), line_total_cents: amount(item.line_total_cents) }
  })
  const result = parseSupplierPurchaseDetail({ ...header(row), items })
  if (result.itemCount !== items.length || result.unmatchedCount !== items.filter(i => i.resolution_status === 'UNMATCHED').length) throw new Error('Invalid counts')
  return { ...result, branchId: apiId(row.branch_id) }
}
function journalKey(operation: string): string {
  const { context } = requireBackendAccess()
  if (!context.branch?.is_active) throw new PurchaseServiceError('Selecciona una sucursal activa.', 'BRANCH_FORBIDDEN')
  return `viveroweb_backend_purchase_v1:${context.user.id}:${context.branch.id}:${operation}`
}
async function durable(operation: string, body: unknown, key: string, signal?: AbortSignal, recover = false): Promise<SupplierPurchaseDetail | null> {
  const slot = journalKey(operation)
  if (!navigator.locks) throw new PurchaseServiceError('Se requiere un navegador con bloqueo seguro de operaciones.', 'LOCK_UNAVAILABLE')
  return navigator.locks.request(slot, async () => {
    const previous = localStorage.getItem(slot)
    if (recover && previous === null) return null
    let stored = { key, body: JSON.stringify(body) }
    if (previous !== null) {
      const parsed = object(JSON.parse(previous))
      if (typeof parsed.key !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(parsed.key) || typeof parsed.body !== 'string') throw new Error('Invalid attempt')
      stored = { key: parsed.key, body: parsed.body }
      if (!recover && stored.body !== JSON.stringify(body)) throw new PurchaseServiceError('Existe un borrador pendiente con otros datos. Recupera el borrador original antes de crear otro.', 'PENDING_PURCHASE')
    }
    const encoded = JSON.stringify(stored)
    localStorage.setItem(slot, encoded)
    if (localStorage.getItem(slot) !== encoded) throw new PurchaseServiceError('No se pudo guardar el intento. No se envió la operación.', 'STORAGE_FAILED')
    if (journalKey(operation) !== slot) throw new Error('Identity changed')
    const path = operation === 'draft' ? 'supplier-purchases' : `supplier-purchases/${id(operation)}/confirm`
    const result = detail(await backendHttp(path, 'POST', JSON.parse(stored.body), signal, stored.key))
    if (result.branchId !== String(requireBackendAccess().context.branch?.id)) throw new Error('Branch mismatch')
    if (operation === 'draft' && result.expectedTotalCents !== object(JSON.parse(stored.body)).expected_total_cents) throw new Error('Total mismatch')
    if (operation !== 'draft' && result.id !== operation) throw new Error('Receipt mismatch')
    if (localStorage.getItem(slot) === encoded) localStorage.removeItem(slot)
    return result
  })
}
export async function recoverSupplierPurchaseDraft(signal?: AbortSignal): Promise<SupplierPurchaseDetail | null> {
  return request(() => durable('draft', null, '', signal, true))
}
/** Fence the original key before freeing the slot; keep the full request as an archive. */
export async function retireSupplierPurchaseDraft(signal?: AbortSignal): Promise<SupplierPurchaseDetail | null> {
  return request(async () => {
    const slot = journalKey('draft')
    if (!navigator.locks) throw new PurchaseServiceError('Se requiere un navegador con bloqueo seguro de operaciones.', 'LOCK_UNAVAILABLE')
    return navigator.locks.request(slot, async () => {
      const encoded = localStorage.getItem(slot)
      if (encoded === null) return null
      const stored = object(JSON.parse(encoded))
      if (typeof stored.key !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(stored.key) || typeof stored.body !== 'string') throw new Error('Invalid attempt')
      const root = await backendHttp('supplier-purchases/retire', 'POST', {}, signal, stored.key)
      if (journalKey('draft') !== slot || localStorage.getItem(slot) !== encoded) throw new Error('Identity or attempt changed')
      if (root.schema_version !== 1) throw new Error('Invalid retirement')
      if (root.status === 'COMMITTED') {
        const result = detail(object(root.receipt))
        if (result.branchId !== String(requireBackendAccess().context.branch?.id) || result.expectedTotalCents !== object(JSON.parse(stored.body)).expected_total_cents) throw new Error('Receipt mismatch')
        localStorage.removeItem(slot)
        return result
      }
      if (root.status !== 'RETIRED' || root.receipt !== null) throw new Error('Invalid retirement')
      const archive = `${slot}:retired:${stored.key}`
      localStorage.setItem(archive, encoded)
      if (localStorage.getItem(archive) !== encoded) throw new PurchaseServiceError('No se pudo conservar el borrador. El intento sigue guardado.', 'STORAGE_FAILED')
      localStorage.removeItem(slot)
      return null
    })
  })
}
export async function fetchSuppliers(signal?: AbortSignal): Promise<Supplier[]> {
  return request(async () => {
    const suppliers: Supplier[] = []
    let after = 0
    do {
      const root = await backendHttp('suppliers?limit=100' + (after ? '&after_id=' + after : ''), 'GET', undefined, signal)
      const rows = list(root.items)
      for (const row of rows) suppliers.push(parseSupplier({ ...row, id: apiId(row.id) }))
      if (root.next_after_id === null) return suppliers
      const next = Number(apiId(root.next_after_id))
      if (next <= after || rows.length !== 100 || next !== rows.at(-1)?.id) throw new Error('Invalid cursor')
      after = next
    } while (after < 4294967295)
    throw new Error('Invalid cursor')
  })
}
export async function upsertSupplier(input: UpsertSupplierInput, signal?: AbortSignal): Promise<Supplier> {
  return request(async () => {
    const root = await backendHttp(input.id ? `suppliers/${id(input.id)}` : 'suppliers', input.id ? 'PATCH' : 'POST', { code: input.code.trim().toUpperCase(), name: input.name.trim(), is_active: true }, signal)
    const row = object(root.supplier)
    return parseSupplier({ ...row, id: apiId(row.id) })
  })
}
export async function createSupplierPurchaseDraft(input: CreatePurchaseDraftInput, signal?: AbortSignal): Promise<SupplierPurchaseDetail> {
  return request(async () => { const result = await durable('draft', {
    supplier_id: id(input.supplierId), document_date: input.documentDate,
    external_reference: input.externalReference?.trim() || null, payment_terms: input.paymentTerms,
    expected_total_cents: input.expectedTotalCents, source_file_name: input.sourceFileName?.trim() || null,
    items: input.items.map(item => ({ line_number: item.lineNumber, raw_description: item.rawDescription.trim(),
      container_code: item.containerCode.trim().toUpperCase(), suggested_common_name: item.suggestedCommonName?.trim() || null,
      suggested_presentation: item.suggestedPresentation?.trim() || null, quantity: item.quantity, unit_cost_cents: item.unitCostCents })),
  }, input.idempotencyKey, signal); if (!result) throw new Error('Missing draft'); return result })
}
export async function fetchSupplierPurchases(params: { status?: PurchaseStatus | null; limit?: number } = {}, signal?: AbortSignal): Promise<SupplierPurchasesResponse> {
  return request(async () => {
    const query = new URLSearchParams({ limit: String(params.limit ?? 50) })
    if (params.status) query.set('status', params.status)
    const root = await backendHttp('supplier-purchases?' + query, 'GET', undefined, signal)
    if (root.schema_version !== 1) throw new Error('Invalid version')
    return parseSupplierPurchasesResponse({ schemaVersion: 1, branchId: apiId(root.branch_id), items: list(root.items).map(header) })
  })
}
export async function fetchSupplierPurchaseDetail(purchaseId: string, signal?: AbortSignal): Promise<SupplierPurchaseDetail> {
  return request(async () => detail(await backendHttp(`supplier-purchases/${id(purchaseId)}`, 'GET', undefined, signal)))
}
export async function setSupplierPresentation(input: SetSupplierPresentationInput, signal?: AbortSignal): Promise<void> {
  await request(() => backendHttp(`suppliers/${id(input.supplierId)}/presentations`, 'PUT', {
    code: input.code.trim().toUpperCase(), display_name: input.displayName.trim() || null,
    nominal_size: input.nominalSize === null ? null : String(input.nominalSize), size_unit: input.sizeUnit, notes: input.notes?.trim() || null,
  }, signal))
}
export async function resolveSupplierPurchaseItem(input: ResolvePurchaseItemInput, signal?: AbortSignal): Promise<void> {
  await request(async () => detail(await backendHttp(`supplier-purchases/${id(input.purchaseId)}/items/${id(input.itemId)}`, 'PATCH', {
    resolution_status: input.resolution, product_id: input.resolution === 'MATCHED' && input.productId ? id(input.productId) : null,
    suggested_common_name: input.normalizedName?.trim() || null, suggested_presentation: input.presentation?.trim() || null,
  }, signal)))
}
export async function confirmSupplierPurchase(input: ConfirmPurchaseInput, signal?: AbortSignal): Promise<SupplierPurchaseDetail> {
  try { return await request(async () => { const result = await durable(String(id(input.purchaseId)), {}, input.confirmationKey, signal); if (!result) throw new Error('Missing receipt'); return result }) }
  catch (error) {
    if (signal?.aborted) throw error
    try { const verified = await fetchSupplierPurchaseDetail(input.purchaseId, signal); if (verified.status === 'RECEIVED') return verified } catch { /* Preserve the original uncertainty. */ }
    throw error
  }
}
