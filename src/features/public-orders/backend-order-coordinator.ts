import { BackendOrderError, clearBackendOrderAttempt, readBackendOrderAttempt, saveBackendOrderAttempt,
  type BackendOrderAttempt, type BackendOrderReceipt, type createBackendOrderService } from './backend-order-service'

type Service = ReturnType<typeof createBackendOrderService>
type Lock = <T>(work: () => Promise<T>) => Promise<T>
// Serialize tabs sharing the durable attempt. Missing lock support blocks writes.
export function createBackendOrderCoordinator(storage: Storage, service: Service, lock: Lock) {
  const same = (a: BackendOrderAttempt, b: BackendOrderAttempt) => a.key === b.key && a.body === b.body
  async function finish(attempt: BackendOrderAttempt, receipt: BackendOrderReceipt) {
    const input: unknown = JSON.parse(attempt.body)
    if (!input || typeof input !== 'object' || !('expected_total_cents' in input) || receipt.total_cents !== input.expected_total_cents) {
      throw new BackendOrderError('INCOMPATIBLE_RESPONSE', true)
    }
    const current = readBackendOrderAttempt(storage)
    if (!current || !same(current, attempt)) throw new Error('El intento guardado cambió. Revisa su resultado.')
    clearBackendOrderAttempt(storage)
    return receipt
  }
  return {
    send: (attempt: BackendOrderAttempt) => lock(async () => {
      const current = readBackendOrderAttempt(storage)
      if (current) throw new Error('Existe un pedido pendiente. Recupera su resultado antes de enviar otro.')
      saveBackendOrderAttempt(storage, attempt)
      const saved = readBackendOrderAttempt(storage)
      if (!saved || !same(saved, attempt)) throw new Error('No se pudo conservar el intento. No se envió el pedido.')
      return finish(attempt, await service.submit(attempt))
    }),
    recover: (attempt: BackendOrderAttempt) => lock(async () => {
      const current = readBackendOrderAttempt(storage)
      if (!current || !same(current, attempt)) throw new Error('El intento guardado cambió. Actualiza la pantalla.')
      let receipt: BackendOrderReceipt
      try { receipt = await service.recover(attempt.key) }
      catch (error) {
        if (!(error instanceof BackendOrderError) || error.code !== 'WEB_ORDER_NOT_FOUND') throw error
        receipt = await service.submit(attempt)
      }
      return finish(attempt, receipt)
    }),
  }
}
export function browserOrderLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return Promise.reject(new Error('Este navegador no permite proteger el pedido entre pestañas.'))
  return navigator.locks.request('viveroweb-backend-public-order', { mode: 'exclusive' }, work)
}
