import { useEffect, useRef, useState, type FormEvent } from 'react'
import { addCounterProduct, prepareCounterSale, validQuantity, type CounterLine, type CounterSubmission } from './counter-sale'
import { CounterRejected, finishCounterSale, lookupCounterProduct, readCounterPending, searchCounterProducts, submitCounterSale } from './counter-sale-service'
import { searchCustomers } from '../admin/admin-customers-service'
import type { AdminCustomer } from '../admin/admin-customers-types'
import { formatCents } from './cashier-money'

export function CounterSaleComposer({ userId, branchId, onCreated, onClose }: {
  userId: string; branchId: string; onCreated: (saleId: string) => void; onClose: () => void
}) {
  const [boot] = useState(() => {
    try { return { pending: readCounterPending(userId, branchId), error: '' } }
    catch { return { pending: null, error: 'No se pudo leer el intento guardado. No borres los datos del navegador; solicita revisar las ventas pendientes.' } }
  })
  const [pending, setPending] = useState<CounterSubmission | null>(boot.pending)
  const [lines, setLines] = useState<CounterLine[]>([])
  const [query, setQuery] = useState(''), [mode, setMode] = useState('name')
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchCounterProducts>>>([])
  const [searched, setSearched] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(boot.error), [notice, setNotice] = useState('')
  const [customerQuery, setCustomerQuery] = useState(''), [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)
  const active = useRef(true), working = useRef(false), inputRef = useRef<HTMLInputElement>(null)
  const controller = useRef(new AbortController())
  useEffect(() => {
    active.current = true
    controller.current = new AbortController()
    return () => { active.current = false; controller.current.abort() }
  }, [])
  useEffect(() => {
    if (!lines.length || pending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [lines.length, pending])
  useEffect(() => {
    if (!busy && mode === 'code' && !pending) inputRef.current?.focus()
  }, [busy, mode, pending])
  const act = async (action: () => Promise<void>) => {
    if (working.current || boot.error) return
    working.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : 'No se pudo completar la operación.') }
    finally { working.current = false; if (active.current) setBusy(false) }
  }
  const add = async (code: string) => {
    const product = await lookupCounterProduct(code)
    if (!active.current) return
    setLines(addCounterProduct(lines, product))
    setNotice(product.name + ' agregado.'); setQuery(''); inputRef.current?.focus()
  }
  const find = (event: FormEvent) => {
    event.preventDefault()
    void act(async () => {
      if (mode === 'code') { await add(query); return }
      const found = await searchCounterProducts(query, controller.current.signal)
      if (active.current) { setResults(found); setSearched(true) }
    })
  }
  const submit = () => void act(async () => {
    const request = pending ?? prepareCounterSale(lines, userId, branchId, customer?.id ?? null, crypto.randomUUID())
    setPending(request)
    try {
      const result = await submitCounterSale(request)
      if (!active.current) return
      finishCounterSale(request)
      onCreated(result.id)
    } catch (reason) {
      if (reason instanceof CounterRejected && active.current) setPending(null)
      throw reason
    }
  })
  const total = lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0)
  const valid = lines.length > 0 && lines.every(line => validQuantity(line.quantity)) && Number.isSafeInteger(total) && total > 0
  return <section className="counter-sale" aria-labelledby="counter-title" aria-busy={busy}>
    <div className="section-header-row"><div><p className="eyebrow">Venta de mostrador</p><h2 id="counter-title">Nueva venta</h2>
      <p>Agrega los productos del cliente y continúa al cobro.</p></div>
      <button type="button" className="retry-btn-secondary" disabled={busy} onClick={onClose}>{pending ? 'Volver a fila (intento guardado)' : 'Cerrar / descartar carrito'}</button></div>
    {error && <p className="admin-page-error" role="alert">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {pending ? <div className="counter-pending"><h3>Venta pendiente de confirmar</h3>
      <p>Folio: <strong>{pending.folio}</strong>. Recuperaremos el mismo intento para evitar duplicar la venta.</p>
      <p>El carrito no se puede modificar hasta conocer el resultado. Este paso todavía no cobra al cliente.</p>
      <button className="catalog-action" disabled={busy || Boolean(boot.error)} onClick={submit}>{busy ? 'Consultando…' : 'Recuperar venta y abrir cobro'}</button></div> :
    <div className="counter-grid">
      <div className="counter-search">
        <form className="dashboard-form" onSubmit={find}><fieldset disabled={busy || Boolean(boot.error)}>
          <legend>Buscar productos</legend>
          <label htmlFor="counter-mode">Buscar por<select id="counter-mode" value={mode} onChange={event => { setMode(event.target.value); setResults([]); setSearched(false); setQuery('') }}>
            <option value="name">Nombre de la planta</option><option value="code">Código / lector QR</option></select></label>
          <label htmlFor="counter-query">{mode === 'code' ? 'Código exacto del producto' : 'Nombre del producto'}
            <input ref={inputRef} id="counter-query" value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={128} required autoComplete="off" /></label>
          <button className="catalog-action">{mode === 'code' ? 'Agregar por código' : 'Buscar'}</button>
        </fieldset></form>
        <p className="counter-hint">El lector QR debe funcionar como teclado. Elige Código, coloca el cursor en el campo y escanea; Enter agrega una unidad.</p>
        <div className="counter-results">{results.map(product => <article key={product.id}><div><strong>{product.name}</strong><small>{product.code}</small></div>
          <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => void act(() => add(product.code))}>Agregar</button></article>)}
          {searched && !results.length && <p role="status">No hay coincidencias. Prueba otro nombre o el código exacto.</p>}
          {results.length === 20 && <p>Se muestran 20 resultados. Escribe un nombre más específico si falta el producto.</p>}
        </div>
      </div>
      <div className="counter-cart"><h3>Productos de la venta</h3>
        {!lines.length && <p className="counter-empty">Busca una planta para comenzar. No necesitas registrar al cliente.</p>}
        {lines.map(line => <article className="counter-line" key={line.product.id}>
          <div><strong>{line.product.name}</strong><small>{line.product.code} · {formatCents(line.product.priceCents)} por unidad</small></div>
          <label>Cantidad<input type="number" min={1} max={100000} step={1} value={line.quantity || ''} disabled={busy}
            onChange={event => { const quantity = Number(event.target.value); setLines(current => current.map(item => item.product.id === line.product.id ? { ...item, quantity } : item)) }} /></label>
          <button type="button" className="retry-btn-secondary" disabled={busy} aria-label={'Quitar ' + line.product.name} onClick={() => setLines(current => current.filter(item => item.product.id !== line.product.id))}>Quitar</button>
        </article>)}
        <details className="counter-customer"><summary>Cliente opcional {customer ? '· ' + customer.fullName : '· Público general'}</summary>
          <form className="dashboard-form" onSubmit={event => { event.preventDefault(); void act(async () => {
            const found = await searchCustomers(customerQuery, 10, controller.current.signal)
            if (active.current) { setCustomers(found); if (!found.length) setNotice('No hay clientes coincidentes. Puedes continuar como público general.') }
          }) }}><fieldset disabled={busy}><label>Buscar cliente<input value={customerQuery} onChange={event => setCustomerQuery(event.target.value)} minLength={2} maxLength={80} required /></label><button className="retry-btn-secondary">Buscar cliente</button></fieldset></form>
          {customers.map(item => <button type="button" className="counter-customer-choice" disabled={busy} key={item.id} onClick={() => { setCustomer(item); setCustomers([]) }}>{item.fullName}{item.phone ? ' · ' + item.phone : ''}</button>)}
          {customer && <button type="button" className="retry-btn-secondary" disabled={busy} onClick={() => setCustomer(null)}>Usar público general</button>}
        </details>
        <div className="counter-total"><span>Total estimado</span><strong>{Number.isSafeInteger(total) ? formatCents(total) : 'Revisa cantidades'}</strong></div>
        <p className="counter-hint">Caja mostrará el total definitivo con los precios y promociones vigentes al enviar. El inventario se valida según la configuración de tu sucursal.</p>
        <button className="catalog-action counter-submit" disabled={busy || !valid || Boolean(boot.error)} onClick={submit}>{busy ? 'Preparando…' : 'Continuar al cobro'}</button>
      </div>
    </div>}
  </section>
}
