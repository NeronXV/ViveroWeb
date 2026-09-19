import { useEffect, useRef, useState } from 'react'
import { CashierPrintableTicket } from './CashierPrintableTicket'
import { getCashierPaymentResult } from './cashier-service'
import { readReceiptReferences, receiptStorageKey, rememberReceipt, type ReceiptReference } from './cashier-receipts'
import type { CashierPaymentAttempt, CashierPaymentResultResponse } from './cashier-types'

export function CashierReceiptHistory({ userId, branchId, attempt, locked }: {
  userId: string; branchId: string; attempt: CashierPaymentAttempt | null; locked: boolean
}) {
  const [rows, setRows] = useState<ReceiptReference[]>([])
  const [result, setResult] = useState<CashierPaymentResultResponse | null>(null)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const key = receiptStorageKey(userId, branchId)

  useEffect(() => {
    try {
      const previous = readReceiptReferences(localStorage.getItem(key))
      const next = attempt?.userId === userId ? rememberReceipt(previous, attempt) : previous
      setRows(next)
      if (next !== previous) localStorage.setItem(key, JSON.stringify(next))
      setStorageError('')
    } catch {
      setStorageError('No se pudo guardar o leer la lista de comprobantes de esta computadora. Conserva el ticket antes de cerrar el cobro.')
    }
  }, [key, userId, attempt])

  useEffect(() => () => { request.current?.abort() }, [])
  useEffect(() => {
    if (locked) { request.current?.abort(); setResult(null); setBusy(false) }
  }, [locked])

  async function retrieve(row: ReceiptReference) {
    if (locked) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await getCashierPaymentResult(row.saleId, row.idempotencyKey, controller.signal)
      if (controller.signal.aborted) return
      if (response.status !== 'SUCCEEDED' || response.sale?.id !== row.saleId) {
        setError('No se encontró un comprobante de pago disponible para esta venta.'); return
      }
      setResult(response)
    } catch {
      if (!controller.signal.aborted) setError('No se pudo consultar el comprobante. Revisa tu conexión y vuelve a seleccionarlo.')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }

  return <section className="botanical-section-card" aria-labelledby="receipt-history-title">
    <h2 id="receipt-history-title">Reimprimir una venta</h2>
    <p>Últimos 100 comprobantes registrados aquí para tu usuario y sucursal. Se consultan en línea; reimprimir no realiza otro cobro.</p>
    {storageError && <p role="alert">{storageError}</p>}
    {!rows.length && <p>Aún no hay comprobantes guardados en este navegador.</p>}
    <div>{rows.map(row => <button key={row.saleId} type="button" className="retry-btn-secondary"
      disabled={locked || busy} onClick={() => void retrieve(row)}>Ver ticket {row.folio}</button>)}</div>
    {busy && <p role="status">Consultando pago confirmado…</p>}
    {error && <p role="alert">{error}</p>}
    {!locked && result && <>
      <CashierPrintableTicket result={result} reprint />
      <button type="button" className="retry-btn-secondary" onClick={() => setResult(null)}>Cerrar comprobante</button>
    </>}
  </section>
}
