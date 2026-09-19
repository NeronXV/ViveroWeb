import type { CashierPaymentAttempt } from './cashier-types'

export interface ReceiptReference { saleId: string; idempotencyKey: string; folio: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const receiptStorageKey = (userId: string, branchId: string) => `vivero_receipts_v1:${userId}:${branchId}`

export function readReceiptReferences(value: string | null): ReceiptReference[] {
  if (!value) return []
  const rows: unknown = JSON.parse(value)
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Historial local incompatible.')
  return rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Historial local incompatible.')
    const entry = row as Record<string, unknown>
    if (typeof entry.saleId !== 'string' || !uuid.test(entry.saleId)
      || typeof entry.idempotencyKey !== 'string' || !uuid.test(entry.idempotencyKey)
      || typeof entry.folio !== 'string' || !entry.folio || entry.folio.length > 100) throw new Error('Historial local incompatible.')
    return { saleId: entry.saleId, idempotencyKey: entry.idempotencyKey, folio: entry.folio }
  })
}

export function rememberReceipt(rows: ReceiptReference[], attempt: CashierPaymentAttempt): ReceiptReference[] {
  const result = attempt.paymentResult
  if (attempt.status !== 'SUCCEEDED' || result?.status !== 'SUCCEEDED' || result.sale?.id !== attempt.saleId) return rows
  return [{ saleId: attempt.saleId, idempotencyKey: attempt.idempotencyKey, folio: result.sale.folio },
    ...rows.filter(row => row.saleId !== attempt.saleId)].slice(0, 100)
}
