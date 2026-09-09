import { getSupabaseClient } from '../../lib/supabase/client'
import { counterStorageKey, parseCounterProduct, parseCreatedSale, parseSubmission, row, type CounterSubmission } from './counter-sale'
export async function searchCounterProducts(query: string, signal: AbortSignal) {
  const escaped = query.trim().replace(/[\\%_]/g, value => '\\' + value)
  if (escaped.length < 2) throw new Error('Escribe al menos dos caracteres.')
  const { data, error } = await getSupabaseClient().from('products').select('id,internal_code,common_name')
    .eq('is_active', true).ilike('common_name', '%' + escaped + '%').order('common_name').order('id').limit(20)
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(10000)]))
  if (error || !Array.isArray(data)) throw new Error('No se pudieron buscar productos. Intenta de nuevo.')
  return data.map(value => {
    const product = row(value)
    if (typeof product.id !== 'string' || typeof product.internal_code !== 'string' || typeof product.common_name !== 'string') throw new Error('Catálogo incompatible.')
    return { id: product.id, code: product.internal_code, name: product.common_name }
  })
}
export async function lookupCounterProduct(code: string) {
  const { data, error } = await getSupabaseClient().rpc('get_product_by_scan_code', { p_code: code.trim() }).abortSignal(AbortSignal.timeout(10000))
  if (error) throw new Error(error.message === 'PRODUCT_SCAN_CODE_AMBIGUOUS' ? 'Hay más de un producto con ese código. Pide revisar el catálogo.' : 'No se pudo consultar el código. Revisa que el servicio esté habilitado.')
  const product = parseCounterProduct(data)
  if (!product) throw new Error('No se encontró un producto activo con ese código.')
  return product
}
export function readCounterPending(userId: string, branchId: string) {
  const saved = localStorage.getItem(counterStorageKey(userId, branchId))
  return saved === null ? null : parseSubmission(JSON.parse(saved), userId, branchId)
}
export class CounterRejected extends Error {}
export async function submitCounterSale(request: CounterSubmission) {
  const key = counterStorageKey(request.userId, request.branchId)
  if (!navigator.locks) throw new Error('Usa un navegador actualizado para crear ventas de forma segura.')
  return navigator.locks.request(key, async () => {
    const pending = readCounterPending(request.userId, request.branchId)
    if (pending && JSON.stringify(pending) !== JSON.stringify(request)) throw new Error('Hay otro intento pendiente. Cierra y vuelve a abrir Nueva venta para recuperarlo.')
    localStorage.setItem(key, JSON.stringify(request))
    const { data, error } = await getSupabaseClient().rpc('submit_sale_to_cashier', {
      p_sale_id: request.id, p_folio: request.folio, p_items: request.items, p_customer_id: request.customerId,
    }).abortSignal(AbortSignal.timeout(15000))
    if (error) {
      if (['22023', '23505'].includes(error.code ?? '')) {
        localStorage.removeItem(key)
        throw new CounterRejected('El servidor rechazó los productos o el folio. Revisa el carrito antes de volver a enviar.')
      }
      throw new Error('No se confirmó el resultado. Recupera este mismo intento; no prepares otra venta por estos productos.')
    }
    return parseCreatedSale(data, request)
  })
}
export function finishCounterSale(request: CounterSubmission) {
  const pending = readCounterPending(request.userId, request.branchId)
  if (pending?.id === request.id) localStorage.removeItem(counterStorageKey(request.userId, request.branchId))
}
