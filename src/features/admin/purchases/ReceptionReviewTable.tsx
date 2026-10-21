import { useState } from 'react'
import type { AdminProduct } from '../admin-catalog-types'
import { readMoney, suggestReceptionProducts, type ReceptionReviewLine } from './reception-review'

function ProductChoice({ line, products, onChange }: { line: ReceptionReviewLine; products: AdminProduct[]; onChange: (patch: Partial<ReceptionReviewLine>) => void }) {
  const [search, setSearch] = useState('')
  const suggestions = suggestReceptionProducts(search || line.name, products)
  const visible = products.filter(p => p.id === line.productId || p.isActive && (!search || p.commonName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || p.internalCode.toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  return <>
    <label>Buscar en catálogo<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre o código" /></label>
    <label>Corresponde a<select value={line.productId || (line.newPlant ? 'new' : '')} onChange={e => onChange({ productId: e.target.value === 'new' ? '' : e.target.value, newPlant: e.target.value === 'new' })}>
      <option value="">Seleccionar planta</option><option value="new">Nueva / por identificar: crear ficha pendiente</option>
      {visible.map(p => <option key={p.id} value={p.id}>{p.commonName} · {p.internalCode}</option>)}
    </select></label>
    {!line.productId && !line.newPlant && <div className="reception-suggestions">
      {suggestions.length ? <><span>Posibles coincidencias; confirma nombre y presentación:</span>{suggestions.map(p => <button key={p.id} type="button" className="suggestion-chip-btn" onClick={() => onChange({ productId: p.id, newPlant: false })}>{p.commonName} · {p.internalCode}</button>)}</> : <small>Sin sugerencias por nombre. Busca en el catálogo o elige crear una ficha pendiente.</small>}
    </div>}
  </>
}

export function ReceptionReviewTable({ lines, products, saved, update, remove }: {
  lines: ReceptionReviewLine[]; products: AdminProduct[]; saved: boolean
  update: (index: number, patch: Partial<ReceptionReviewLine>) => void; remove: (index: number) => void
}) {
  return <div className="reception-table-scroll" tabIndex={0} role="region" aria-label="Partidas del documento">
    <table className="reception-review-table"><caption>Plantas del documento y cantidades recibidas</caption>
      <thead><tr><th scope="col">Planta y presentación</th><th scope="col">Vinculación al catálogo</th><th scope="col">Cantidades</th><th scope="col">Costo y total</th></tr></thead>
      <tbody>{lines.map((line, index) => {
        const cost = readMoney(line.cost)
        const quantityText = saved ? line.received : line.documentQuantity
        const quantity = Number(quantityText)
        return <tr key={index}>
          <td><strong>Partida {index + 1}</strong><label>Nombre del documento<input maxLength={160} value={line.name} disabled={saved && !!line.productId} onChange={e => update(index, { name: e.target.value, ...(!saved ? { rawDescription: e.target.value } : {}) })} /></label>
            <label>Presentación del proveedor (opcional)<input maxLength={120} value={line.presentation} onChange={e => update(index, { presentation: e.target.value })} placeholder="B6, maceta, bolsa…" /></label>
            <small>Texto de origen: {line.rawDescription}</small>
            {!saved && <button type="button" className="retry-btn-secondary" onClick={() => remove(index)}>Quitar partida {index + 1}</button>}
          </td>
          <td><ProductChoice line={line} products={products} onChange={patch => update(index, patch)} />{line.newPlant && <small>Quedará pendiente para que la gerente complete o vincule la ficha.</small>}</td>
          <td>{!saved&&<label>Cantidad del documento<input inputMode="numeric" value={line.documentQuantity} disabled={saved} onChange={e => update(index, { documentQuantity: e.target.value })} /></label>}
            <label>Cantidad recibida<input inputMode="numeric" value={line.received} onChange={e => update(index, { received: e.target.value })} /></label><small>Usa 0 si no llegó.</small></td>
          <td><label>Costo unitario del documento<input inputMode="decimal" value={line.cost} disabled={saved} onChange={e => update(index, { cost: e.target.value })} /></label>
            <p>{saved?'Importe a recibir':'Total del renglón'}: {cost !== null && /^\d+$/.test(quantityText) && Number.isSafeInteger(cost * quantity) ? `$${(cost * quantity / 100).toFixed(2)}` : 'Por revisar'}</p>
            {cost === 0 && <small>Sin costo: confirma si corresponde registrar cero.</small>}
            {saved && <small>El costo del documento guardado se conserva.</small>}
          </td>
        </tr>
      })}</tbody>
    </table>
  </div>
}
