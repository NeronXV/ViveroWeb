import type {
  PaymentTerms,
  PurchaseSourceItem,
  PurchaseStatus,
  ResolutionStatus,
  Supplier,
  SupplierPurchaseDetail,
  SupplierPurchaseDetailItem,
  SupplierPurchaseListItem,
  SupplierPurchasesResponse,
} from './purchases-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePaymentTerms(value: unknown): PaymentTerms {
  if (value === 'CASH' || value === 'CREDIT' || value === 'OTHER') {
    return value
  }
  return 'OTHER'
}

function parsePurchaseStatus(value: unknown): PurchaseStatus {
  if (value === 'DRAFT' || value === 'RECEIVED' || value === 'CANCELLED') {
    return value
  }
  return 'DRAFT'
}

function parseResolutionStatus(value: unknown): ResolutionStatus {
  if (value === 'UNMATCHED' || value === 'AUTO_MATCHED' || value === 'MATCHED' || value === 'IGNORED') {
    return value
  }
  return 'UNMATCHED'
}

export function parseSupplier(data: unknown): Supplier {
  if (!isRecord(data)) {
    throw new Error('El proveedor recibido no es un objeto válido.')
  }

  const id = typeof data.id === 'string' ? data.id : ''
  const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : ''
  const name = typeof data.name === 'string' ? data.name.trim() : ''

  if (!id || !code || !name) {
    throw new Error('El proveedor carece de campos obligatorios (id, código o nombre).')
  }

  return { id, code, name }
}

export function parsePurchaseListItem(data: unknown): SupplierPurchaseListItem {
  if (!isRecord(data)) {
    throw new Error('El registro de compra no es un objeto válido.')
  }

  const id = typeof data.id === 'string' ? data.id : ''
  if (!id) throw new Error('El registro de compra no tiene ID.')

  const supplierRaw = data.supplier ?? (isRecord(data) && 'supplier_id' in data ? {
    id: data.supplier_id,
    code: data.supplier_code ?? 'PROV',
    name: data.supplier_name ?? 'Proveedor',
  } : null)

  const supplier = parseSupplier(supplierRaw)
  const documentDate = typeof data.documentDate === 'string'
    ? data.documentDate
    : typeof data.document_date === 'string'
      ? data.document_date
      : ''

  const externalReference = typeof data.externalReference === 'string'
    ? data.externalReference
    : typeof data.external_reference === 'string'
      ? data.external_reference
      : null

  const paymentTerms = parsePaymentTerms(data.paymentTerms ?? data.payment_terms)
  const expectedTotalCents = Number.isInteger(data.expectedTotalCents)
    ? (data.expectedTotalCents as number)
    : Number.isInteger(data.expected_total_cents)
      ? (data.expected_total_cents as number)
      : Math.round(Number(data.expectedTotalCents ?? data.expected_total_cents ?? 0))

  const status = parsePurchaseStatus(data.status)
  const itemCount = Number(data.itemCount ?? data.item_count ?? 0)
  const unmatchedCount = Number(data.unmatchedCount ?? data.unmatched_count ?? 0)

  const createdAt = typeof data.createdAt === 'string'
    ? data.createdAt
    : typeof data.created_at === 'string'
      ? data.created_at
      : new Date().toISOString()

  const receivedAt = typeof data.receivedAt === 'string'
    ? data.receivedAt
    : typeof data.received_at === 'string'
      ? data.received_at
      : null

  return {
    id,
    supplier,
    documentDate,
    externalReference,
    paymentTerms,
    expectedTotalCents,
    status,
    itemCount,
    unmatchedCount,
    createdAt,
    receivedAt,
  }
}

export function parseSupplierPurchasesResponse(data: unknown): SupplierPurchasesResponse {
  if (Array.isArray(data)) {
    return {
      schemaVersion: 1,
      branchId: '',
      items: data.map(parsePurchaseListItem),
    }
  }

  if (!isRecord(data)) {
    throw new Error('La respuesta de compras no es válida.')
  }

  const schemaVersion = Number(data.schemaVersion ?? data.schema_version ?? 1)
  const branchId = typeof data.branchId === 'string'
    ? data.branchId
    : typeof data.branch_id === 'string'
      ? data.branch_id
      : ''

  const rawItems = Array.isArray(data.items) ? data.items : []
  const items = rawItems.map(parsePurchaseListItem)

  return { schemaVersion, branchId, items }
}

export function parsePurchaseDetailItem(data: unknown): SupplierPurchaseDetailItem {
  if (!isRecord(data)) {
    throw new Error('El renglón de compra no es un objeto válido.')
  }

  const id = typeof data.id === 'string' ? data.id : ''
  const lineNumber = Number(data.lineNumber ?? data.line_number ?? 0)
  const rawDescription = typeof data.rawDescription === 'string'
    ? data.rawDescription
    : typeof data.raw_description === 'string'
      ? data.raw_description
      : ''
  const containerCode = typeof data.containerCode === 'string'
    ? data.containerCode
    : typeof data.container_code === 'string'
      ? data.container_code
      : ''

  const supplierPresentation = typeof data.supplierPresentation === 'string'
    ? data.supplierPresentation
    : typeof data.supplier_presentation === 'string'
      ? data.supplier_presentation
      : null

  const suggestedCommonName = typeof data.suggestedCommonName === 'string'
    ? data.suggestedCommonName
    : typeof data.suggested_common_name === 'string'
      ? data.suggested_common_name
      : null

  const suggestedPresentation = typeof data.suggestedPresentation === 'string'
    ? data.suggestedPresentation
    : typeof data.suggested_presentation === 'string'
      ? data.suggested_presentation
      : null

  const quantity = Number(data.quantity ?? 0)
  const unitCostCents = Number(data.unitCostCents ?? data.unit_cost_cents ?? 0)
  const lineTotalCents = Number(data.lineTotalCents ?? data.line_total_cents ?? quantity * unitCostCents)
  const productId = typeof data.productId === 'string'
    ? data.productId
    : typeof data.product_id === 'string'
      ? data.product_id
      : null

  const resolutionStatus = parseResolutionStatus(data.resolutionStatus ?? data.resolution_status)

  return {
    id,
    lineNumber,
    rawDescription,
    containerCode,
    supplierPresentation,
    suggestedCommonName,
    suggestedPresentation,
    quantity,
    unitCostCents,
    lineTotalCents,
    productId,
    resolutionStatus,
  }
}

export function parseSupplierPurchaseDetail(data: unknown): SupplierPurchaseDetail {
  if (!isRecord(data)) {
    throw new Error('El detalle de compra no es un objeto válido.')
  }

  // Handle case where backend returns { purchase: { ... }, items: [ ... ] }
  const purchaseObj = isRecord(data.purchase) ? data.purchase : data
  const rawItems = Array.isArray(data.items)
    ? data.items
    : isRecord(data.purchase) && Array.isArray(data.purchase.items)
      ? data.purchase.items
      : []

  const parsedHeader = parsePurchaseListItem(purchaseObj)
  const items = rawItems.map(parsePurchaseDetailItem)

  const sourceFileName = typeof purchaseObj.sourceFileName === 'string'
    ? purchaseObj.sourceFileName
    : typeof purchaseObj.source_file_name === 'string'
      ? purchaseObj.source_file_name
      : null

  return {
    ...parsedHeader,
    sourceFileName,
    items,
  }
}

// Utility formatting and conversions
export function centsToPesos(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00'
  return (cents / 100).toFixed(2)
}

export function pesosToCents(pesos: string | number): number {
  if (typeof pesos === 'number') {
    return Math.round(pesos * 100)
  }
  const clean = pesos.replace(/[^0-9.-]+/g, '')
  const val = parseFloat(clean)
  if (isNaN(val)) return 0
  return Math.round(val * 100)
}

export function centsToFormattedMxn(cents: number): string {
  const pesos = cents / 100
  return `$${pesos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`
}

export function calculateExpectedTotalCents(items: { quantity: number; unitCostCents: number }[]): number {
  return items.reduce((acc, item) => acc + Math.round(item.quantity) * Math.round(item.unitCostCents), 0)
}

export function validateSupplierCode(code: string): boolean {
  const trimmed = code.trim().toUpperCase()
  return /^[A-Z0-9-]+$/.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 50
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || 'documento'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

export function validatePurchaseLines(items: PurchaseSourceItem[]): string | null {
  if (!items || items.length === 0) {
    return 'Debes incluir al menos un renglón en la compra.'
  }

  if (items.length > 250) {
    return 'No puedes registrar más de 250 renglones por compra.'
  }

  const seenLineNumbers = new Set<number>()

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (!Number.isInteger(item.lineNumber) || item.lineNumber <= 0) {
      return `El renglón ${i + 1} tiene un número de línea inválido.`
    }
    if (seenLineNumbers.has(item.lineNumber)) {
      return `El número de renglón ${item.lineNumber} está duplicado.`
    }
    seenLineNumbers.add(item.lineNumber)

    if (!item.rawDescription.trim()) {
      return `El renglón ${item.lineNumber} debe contener una descripción.`
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return `El renglón ${item.lineNumber} debe tener una cantidad entera mayor a cero.`
    }

    if (!Number.isInteger(item.unitCostCents) || item.unitCostCents < 0) {
      return `El renglón ${item.lineNumber} debe tener un costo unitario no negativo en centavos.`
    }
  }

  return null
}
