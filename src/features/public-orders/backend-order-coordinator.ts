import { BackendOrderError, clearBackendOrderAttempt, isDefinitiveOrderRejection, readBackendOrderAttempt, readBackendOrderTicket, saveBackendOrderAttempt, saveBackendOrderTicket,
  type BackendOrderAttempt, type BackendOrderReceipt, type BackendOrderTicket, type createBackendOrderService } from './backend-order-service'

type Service = ReturnType<typeof createBackendOrderService>
type Lock = <T>(work: () => Promise<T>) => Promise<T>
// Serialize tabs sharing the durable attempt. Missing lock support blocks writes.
export function createBackendOrderCoordinator(storage: Storage, service: Service, lock: Lock) {
  const same = (a: BackendOrderAttempt, b: BackendOrderAttempt) => a.key === b.key && a.body === b.body
  async function submitOriginal(attempt: BackendOrderAttempt) {
    try { return await service.submit(attempt) }
    catch (error) {
      if (isDefinitiveOrderRejection(error)) {
        const current = readBackendOrderAttempt(storage)
        if (current && same(current, attempt)) clearBackendOrderAttempt(storage)
      }
      throw error
    }
  }
  async function finish(attempt: BackendOrderAttempt, receipt: BackendOrderReceipt) {
    const input: unknown = JSON.parse(attempt.body)
    if (!input || typeof input !== 'object' || !('expected_total_cents' in input) || receipt.total_cents !== input.expected_total_cents) {
      throw new BackendOrderError('INCOMPATIBLE_RESPONSE', true)
    }
    const current = readBackendOrderAttempt(storage)
    if (!current || !same(current, attempt)) throw new Error('El intento guardado cambió. Revisa su resultado.')
    if (receipt.ticket) {
      const submitted = JSON.parse(attempt.body) as { branch_id: number; items: Array<{ product_id: number; quantity: number }> }
      if (receipt.ticket.branch.id !== submitted.branch_id || receipt.ticket.items.length !== submitted.items.length
        || receipt.ticket.items.some(item => !submitted.items.some(original => original.product_id === item.product_id && original.quantity === item.quantity))) {
        throw new BackendOrderError('INCOMPATIBLE_RESPONSE', true)
      }
      saveBackendOrderTicket(storage, receipt.ticket)
    }
    clearBackendOrderAttempt(storage)
    return receipt
  }
  return {
    send: (attempt: BackendOrderAttempt, previousTicket: BackendOrderTicket | null = readBackendOrderTicket(storage)) => lock(async () => {
      const current = readBackendOrderAttempt(storage)
      if (current) throw new Error('Existe un pedido pendiente. Recupera su resultado antes de enviar otro.')
      // A tab may have quoted before another tab completed its order.
      if (JSON.stringify(readBackendOrderTicket(storage)) !== JSON.stringify(previousTicket)) {
        throw new BackendOrderError('ORDER_CONFIRMED_IN_ANOTHER_TAB')
      }
      saveBackendOrderAttempt(storage, attempt)
      const saved = readBackendOrderAttempt(storage)
      if (!saved || !same(saved, attempt)) throw new Error('No se pudo conservar el intento. No se envió el pedido.')
      return finish(attempt, await submitOriginal(attempt))
    }),
    recover: (attempt: BackendOrderAttempt) => lock(async () => {
      const current = readBackendOrderAttempt(storage)
      if (!current || !same(current, attempt)) throw new Error('El intento guardado cambió. Actualiza la pantalla.')
      let receipt: BackendOrderReceipt
      try { receipt = await service.recover(attempt.key) }
      catch (error) {
        if (!(error instanceof BackendOrderError) || error.code !== 'WEB_ORDER_NOT_FOUND' || error.httpStatus !== 404) throw error
        receipt = await submitOriginal(attempt)
      }
      return finish(attempt, receipt)
    }),
  }
}
export function browserOrderLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return Promise.reject(new Error('Este navegador no permite proteger el pedido entre pestañas.'))
  return navigator.locks.request('viveroweb-backend-public-order', { mode: 'exclusive' }, work)
}
