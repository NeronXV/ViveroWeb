export interface CounterProduct { id: string; code: string; name: string; priceCents: number }
export interface CounterLine { product: CounterProduct; quantity: number }
export interface CounterSubmission {
  id: string; folio: string; userId: string; branchId: string; customerId: string | null;
  items: Array<{ product_id: string; quantity: number }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta incompatible.')
  return value as Record<string, unknown>
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Identificador incompatible.')
  return value
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Respuesta incompatible.')
  return value
}
export function validQuantity(value: number) { return Number.isInteger(value) && value >= 1 && value <= 100000 }
export function parseCounterProduct(value: unknown): CounterProduct | null {
  const data = row(value)
  if (data.schemaVersion !== 1) throw new Error('Versión incompatible.')
  if (data.item === null) return null
  const item = row(data.item), product = row(item.product), pricing = row(item.pricing)
  const productId = id(product.id)
  if (product.is_active !== true || pricing.productId !== productId ||
      !Number.isSafeInteger(pricing.effectivePriceCents) || Number(pricing.effectivePriceCents) < 0) throw new Error('Producto incompatible.')
  return { id: productId, code: string(product.internal_code), name: string(product.common_name), priceCents: Number(pricing.effectivePriceCents) }
}
export function addCounterProduct(lines: CounterLine[], product: CounterProduct): CounterLine[] {
  const old = lines.find(line => line.product.id === product.id)
  if (old && !validQuantity(old.quantity + 1)) throw new Error('La cantidad supera el límite permitido.')
  if (!old && lines.length >= 100) throw new Error('La venta admite hasta 100 productos distintos.')
  return old ? lines.map(line => line.product.id === product.id ? { product, quantity: line.quantity + 1 } : line)
    : [...lines, { product, quantity: 1 }]
}
export function prepareCounterSale(lines: CounterLine[], userId: string, branchId: string, customerId: string | null, saleId: string, date = new Date()): CounterSubmission {
  if (!lines.length || lines.length > 100 || lines.some(line => !validQuantity(line.quantity)) ||
      new Set(lines.map(line => line.product.id)).size !== lines.length) throw new Error('Revisa los productos y cantidades.')
  const day = date.toISOString().slice(2, 10).replaceAll('-', '')
  return { id: id(saleId), folio: 'VD-' + day + '-' + saleId.replaceAll('-', '').slice(0, 6).toUpperCase(),
    userId: id(userId), branchId: id(branchId), customerId: customerId === null ? null : id(customerId),
    items: lines.map(line => ({ product_id: id(line.product.id), quantity: line.quantity })) }
}
export function parseSubmission(value: unknown, userId: string, branchId: string): CounterSubmission {
  const data = row(value)
  if (data.userId !== userId || data.branchId !== branchId || !Array.isArray(data.items)) throw new Error('Intento pendiente incompatible.')
  const lines = data.items.map(value => { const item = row(value); if (typeof item.quantity !== 'number') throw new Error('Cantidad incompatible.'); return { product: { id: id(item.product_id), name: '', code: '', priceCents: 0 }, quantity: Number(item.quantity) } })
  const parsed = prepareCounterSale(lines, userId, branchId, data.customerId === null ? null : id(data.customerId), id(data.id))
  if (typeof data.folio !== 'string' || !/^VD-[0-9]{6}-[A-Z0-9]{6}$/.test(data.folio)) throw new Error('Folio incompatible.')
  return { ...parsed, folio: data.folio }
}
export function parseCreatedSale(value: unknown, request: CounterSubmission) {
  const sale = row(value)
  if (sale.id !== request.id || sale.idempotency_key !== request.id || sale.created_by !== request.userId ||
      sale.branch_id !== request.branchId || sale.folio !== request.folio ||
      !['SENT_TO_CASHIER', 'PAYMENT_PENDING', 'PAID', 'DELIVERED', 'CANCELLED'].includes(String(sale.status)) ||
      !Number.isSafeInteger(sale.total_cents) || Number(sale.total_cents) <= 0) throw new Error('No se pudo verificar la venta creada.')
  return { id: request.id, folio: request.folio, status: String(sale.status), totalCents: Number(sale.total_cents) }
}
export const counterStorageKey = (userId: string, branchId: string) => 'vivero.counter-sale.v1.' + userId + '.' + branchId
