import { useEffect, useState } from 'react'
import { apiId, backendHttp, list, object } from '../../../lib/backend-http'

interface Entry { id:string; product:string; actor:string; action:string; reason:string; date:string; before:Record<string,unknown>; after:Record<string,unknown> }
const labels:Record<string,string>={CREATE:'Alta de planta',LINK:'Vinculación',EDIT:'Edición de ficha',PHOTO:'Fotografía',CONFIRM:'Confirmación',DIRECT_COUNT:'Conteo directo',APPROVED_COUNT:'Conteo aprobado',RECEPTION:'Entrada',PURCHASE:'Compra recibida'}
const fields:Record<string,string>={common_name:'Nombre',category_id:'Categoría',description:'Descripción',scientific_name:'Nombre científico',light_type:'Luz',watering_advice:'Riego',price_cents:'Precio MXN',is_active:'Activa',image_id:'Fotografía',initial_quantity:'Cantidad inicial',quantity:'Existencias',difference:'Diferencia',ready:'Habilitada'}
const value=(key:string,v:unknown)=>v==null?'—':key==='price_cents'?`$${(Number(v)/100).toFixed(2)}`:typeof v==='boolean'?(v?'Sí':'No'):String(v)
export function PlantHistory({productId}:{productId?:string}) {
  const [visible,setVisible]=useState(false)
  return visible?<HistoryEntries key={productId??'all'} productId={productId}/>:<button onClick={()=>setVisible(true)}>Consultar historial de cambios</button>
}
function HistoryEntries({productId}:{productId?:string}) {
  const [entries,setEntries]=useState<Entry[]>([]),[next,setNext]=useState<string|null>(null),[cursor,setCursor]=useState<string|null>(null)
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setError('')
    const query=new URLSearchParams();if(productId)query.set('product_id',productId);if(cursor)query.set('before_id',cursor)
    backendHttp(`plants/history?${query}`,'GET',undefined,controller.signal).then(r=>{
      const rows=list(r.items).map(raw=>{const e=object(raw)
        for(const key of ['product_name','actor_name','action','reason','created_at'])if(typeof e[key]!=='string')throw new Error('Historial incompatible.')
        return {id:apiId(e.id),product:String(e.product_name),actor:String(e.actor_name),action:String(e.action),reason:String(e.reason),date:String(e.created_at),before:object(e.before_values),after:object(e.after_values)}
      })
      if(!controller.signal.aborted){setEntries(old=>cursor?[...old,...rows]:rows);setNext(r.next_before_id===null?null:apiId(r.next_before_id))}
    }).catch(()=>{if(!controller.signal.aborted)setError('No se pudo consultar el historial.')}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
    return()=>controller.abort()
  },[productId,cursor,retry])
  return <section aria-label="Historial de cambios" aria-busy={busy}><h3>Historial de cambios</h3>
    <label>Filtrar registros cargados por planta, persona o fecha<input value={filter} onChange={e=>setFilter(e.target.value)} /></label>
    {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></p>}
    {!busy&&!error&&!entries.length&&<p>No hay cambios registrados desde la incorporación de este historial. Los movimientos anteriores siguen en Inventario.</p>}
    {entries.filter(e=>`${e.product} ${e.actor} ${e.date}`.toLowerCase().includes(filter.toLowerCase())).map(e=><article key={e.id} className="plant-preparation">
      <strong>{labels[e.action]??e.action} · {e.product}</strong><p>{e.actor} · {new Date(e.date).toLocaleString('es-MX')}</p><p>{e.reason}</p>
      <ul>{Object.entries(e.after).filter(([k,v])=>JSON.stringify(e.before[k])!==JSON.stringify(v)).map(([k,v])=><li key={k}>{fields[k]??k}: {value(k,e.before[k])} → {value(k,v)}</li>)}</ul>
    </article>)}
    {busy&&<p role="status">Consultando historial…</p>}{next&&<button disabled={busy} onClick={()=>setCursor(next)}>Cargar cambios anteriores</button>}
  </section>
}
