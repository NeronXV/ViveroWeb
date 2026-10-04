import { backendId, requireBackendAccess } from '../auth/backend-runtime'
import { createBackendCatalogService } from '../public-catalog/backend-catalog-service'
import { BackendCounterError, createBackendCounterAttempt, createBackendCounterSaleService, readBackendCounterAttempt, finishBackendCounterAttempt, type BackendCounterAttempt } from './backend-counter-sale-service'
import type { CounterLine } from './counter-sale'
export async function searchCounterProducts(query: string, signal: AbortSignal) {
  if (query.trim().length < 2) throw new Error('Escribe al menos dos caracteres.')
  const page = await createBackendCatalogService().products({ search: query, limit: 20 }, signal)
  return page.items.map(p => ({ id: String(p.id), code: p.internal_code, name: p.common_name }))
}
export async function lookupCounterProduct(code: string) {
  const product = await createBackendCounterSaleService().scan(requireBackendAccess().token, code)
  if (!product) throw new Error('No se encontró un producto activo con ese código.')
  return { id: String(product.id), code: product.internal_code, name: product.common_name, priceCents: product.effective_price_cents }
}
function access(userId: number, branchId: number) {
  const { token, context } = requireBackendAccess()
  if (context.user.id !== userId || context.branch?.id !== branchId || !context.branch.is_active) throw new Error('Cambió la sesión o sucursal. Conserva el intento y vuelve a iniciar sesión.')
  return token
}
export function readCounterPending(userId: string, branchId: string) {
  return readBackendCounterAttempt(localStorage, backendId(userId), backendId(branchId))
}
export async function quoteCounterSale(lines: CounterLine[], userId: string, branchId: string, customerId: string | null) {
  const user = backendId(userId), branch = backendId(branchId), token = access(user, branch)
  const items = lines.map(line => ({ product_id: backendId(line.product.id), quantity: line.quantity }))
  const quote = await createBackendCounterSaleService().quote(token, branch, items)
  return createBackendCounterAttempt(user, branch, { items, expected_total_cents: quote.total_cents, customer_id: customerId === null ? null : backendId(customerId) })
}
export async function submitCounterSale(attempt: BackendCounterAttempt) {
  const token = access(attempt.userId, attempt.branchId), service = createBackendCounterSaleService()
  const pending = readBackendCounterAttempt(localStorage, attempt.userId, attempt.branchId)
  if (pending) {
    if (pending.key !== attempt.key || pending.body !== attempt.body) throw new Error('Hay otra venta pendiente. Vuelve a abrir Nueva venta para recuperarla.')
    try { return await service.recover(token, pending) }
    catch (error) { if (!(error instanceof BackendCounterError) || error.status !== 404 || error.code !== 'SALE_NOT_FOUND') throw error }
  }
  return service.submit(token, attempt, localStorage)
}
export function finishCounterSale(attempt: BackendCounterAttempt) { finishBackendCounterAttempt(localStorage, attempt) }
export async function retireCounterSale(attempt: BackendCounterAttempt) {
  const result = await createBackendCounterSaleService().retire(access(attempt.userId, attempt.branchId), attempt)
  finishCounterSale(attempt)
  return result
}
