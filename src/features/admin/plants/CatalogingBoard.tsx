import { useEffect, useState } from 'react'
import type { AdminCategory, AdminProduct } from '../admin-catalog-types'
import { BackendHttpError } from '../../../lib/backend-http'
import { useAuth } from '../../auth/useAuth'
import { hasCapability } from '../../access/access-helpers'
import { catalogingBinary, catalogingError, emptyCatalogingFields, loadCataloging, loadCatalogingDraft, parseCataloging, pendingCataloging, recoverCataloging, saveCataloging, type CatalogingDraft } from './cataloging-service'
import { selectedPhotoError, photoSaveError } from './photo-selection'

const labels={DRAFT:'Por completar',REVIEW:'En revisión',LINKED:'Vinculado al existente',PREPARED:'Ficha preparada'}
const fieldLabels: Record<string,string>={approved_name:'Nombre comercial',presentation:'Presentación',internal_code:'SKU',scientific_name:'Nombre científico',description:'Notas',barcode:'Código de barras',category_id:'Categoría'}
export function CatalogingBoard({ categories, products, onPrepared, guard }: { categories: AdminCategory[]; products: AdminProduct[]; onPrepared:()=>void; guard:(dirty:boolean,busy?:boolean)=>void }) {
  const {accessContext}=useAuth(), canPublish=hasCapability(accessContext, 'PUBLISH_CATALOGING') || accessContext?.role?.name==='OWNER'
  const [rows,setRows]=useState<CatalogingDraft[]>([]), [selected,setSelected]=useState<CatalogingDraft|null>(null)
  const [creating,setCreating]=useState(false), [original,setOriginal]=useState(''), [fields,setFields]=useState(emptyCatalogingFields)
  const [search,setSearch]=useState(''), [status,setStatus]=useState('ALL'), [category,setCategory]=useState('')
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [pending,setPending]=useState(false)
  const [file,setFile]=useState<File|null>(null), [photo,setPhoto]=useState<string|null>(null), [link,setLink]=useState(''), [conflict,setConflict]=useState(false)
  const [photoError,setPhotoError]=useState(''), [photoSaving,setPhotoSaving]=useState(false)
  const dirty=(creating && !!original) || (!!selected && JSON.stringify(fields)!==JSON.stringify(selected.fields)) || !!file
  const locked=!!selected && selected.status!=='DRAFT'
  useEffect(()=>{guard(dirty,busy)},[dirty,busy,guard])
  useEffect(()=>{
    let live=true
    loadCataloging(search,status,category).then(r=>{if(live)setRows(r)}).catch(e=>{if(live)setError(catalogingError(e))})
    return()=>{live=false}
  },[search,status,category])
  useEffect(()=>{try{setPending(pendingCataloging()!==null)}catch{setPending(true);setError('No se pudo leer el guardado pendiente. Conserva este navegador y solicita revisión.')}},[])
  useEffect(()=>{
    let live=true, url:string|null=null
    setPhoto(null)
    if(file) {try{url=URL.createObjectURL(file);setPhoto(url)}catch{setPhotoError('No se pudo mostrar la vista previa. Elige de nuevo la fotografía.')}}
    else if(selected?.has_image) catalogingBinary(`cataloging/${selected.id}/photo`).then(blob=>{url=URL.createObjectURL(blob as Blob);if(live)setPhoto(url);else URL.revokeObjectURL(url)}).catch(()=>{if(live)setError('No se pudo consultar la fotografía.')})
    return()=>{live=false;if(url)URL.revokeObjectURL(url)}
  },[file,selected])
  const refresh=async()=>setRows(await loadCataloging(search,status,category))
  const open=(r:CatalogingDraft|null)=>{if(busy || pending)return;if(dirty && !window.confirm('¿Descartar los cambios sin guardar?'))return;setSelected(r);setFields(r?.fields ?? emptyCatalogingFields());setOriginal(r?.original_name ?? '');setCreating(!r);setFile(null);setPhotoError('');setConflict(false);setError('');setNotice('')}
  const selectPhoto=(input:HTMLInputElement)=>{
    const selected=input.files?.[0];input.value='';if(!selected)return
    const invalid=selectedPhotoError(selected);if(invalid){setPhotoError(invalid);setNotice('');return}
    setFile(selected);setPhotoError('');setNotice('')
  }
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action()}catch(e){setError(catalogingError(e));if(e instanceof BackendHttpError && e.code==='CATALOGING_EDIT_CONFLICT')setConflict(true);try{setPending(pendingCataloging()!==null)}catch{setPending(true)}}finally{setBusy(false)}}
  const save=async(action='SAVE')=>{
    if(pending || conflict)return
    await run(async()=>{
      if(action==='PREPARE' && !window.confirm('¿Confirmar estos datos y crear una ficha inactiva con precio pendiente? No cambia existencias ni habilita ventas.'))return
      if(action==='LINK' && !window.confirm('¿Confirmar que corresponde exactamente al producto elegido? El producto existente se conservará.'))return
      const result=await saveCataloging(selected?.id ?? null,selected ? {revision:selected.revision,action,fields,...(action==='LINK' ? {product_id:Number(link)} : {})} : {original_name:original,fields})
      setSelected(result);setCreating(false);setFields(result.fields);setNotice('Avances guardados en el servidor.');guard(!!file,true)
      await refresh();if(result.product_id)onPrepared()
    })
  }
  const consult=()=>run(async()=>{if(!selected)return;const current=await loadCatalogingDraft(selected.id);setSelected(current);setConflict(false);setNotice('Ficha actual consultada. Tu formulario sigue intacto: compara los campos antes de guardar.');await refresh()})
  const upload=()=>run(async()=>{
    if(!selected || !file || pending || conflict)return
    setPhotoSaving(true);setPhotoError('');setNotice('')
    try{const saved=parseCataloging(await catalogingBinary(`cataloging/${selected.id}/photo`,file,selected.revision));setSelected(saved);setFile(null);setNotice('Fotografía guardada en el servidor.');await refresh()}
    catch(e){setConflict(true);setPhotoError(photoSaveError(e))}
    finally{setPhotoSaving(false)}
  })
  return <section className="cataloging-board" aria-label="Revisión de plantas">
    <div className="plants-list-heading"><div><h4>Revisión de plantas</h4><p>Borradores compartidos. No aparecen en Caja ni tienen existencias.</p></div><button className="plants-primary" disabled={busy || pending} onClick={()=>open(null)}>Nueva planta</button></div>
    {error && <p className="plants-warning" role="alert">{error}</p>}{notice && <p className="plants-notice" role="status">{notice}</p>}
    {pending && <div className="plants-warning"><p>Hay un guardado pendiente de comprobar. Se conserva el mismo intento.</p><button disabled={busy} onClick={()=>void run(async()=>{const r=await recoverCataloging();setSelected(r);setFields(r.fields);setOriginal(r.original_name);setCreating(false);setPending(false);setNotice('Guardado comprobado.');await refresh()})}>Comprobar guardado</button></div>}
    {(selected || creating) ? <div className="plant-count-card">
      <button type="button" disabled={busy || pending} onClick={()=>{if(dirty && !window.confirm('¿Descartar cambios sin guardar?'))return;setSelected(null);setCreating(false);setFile(null);guard(false)}}>Volver a la bandeja</button>
      <h4>{selected ? selected.original_name : 'Nueva planta por identificar'}</h4>
      {selected && <p>{labels[selected.status]} · Revisión {selected.revision}<br/>Último responsable: #{selected.updated_by} · {new Date(selected.updated_at.endsWith('Z') ? selected.updated_at : selected.updated_at.replace(' ','T')+'Z').toLocaleString('es-MX')}</p>}
      {selected && <details><summary>Comparar con los datos guardados</summary><dl>{Object.entries(selected.fields).map(([key,value])=><div key={key}><dt>{fieldLabels[key] ?? key}</dt><dd>{key==='category_id' ? categories.find(c=>Number(c.id)===value)?.name ?? 'Pendiente' : String(value || 'Pendiente')}</dd></div>)}</dl></details>}
      {!!selected?.source_evidence && <details><summary>Documento original y dudas</summary><pre className="cataloging-evidence">{JSON.stringify(selected.source_evidence,null,2)}</pre></details>}
      <form className="plant-edit-form" onSubmit={e=>{e.preventDefault();void save()}}>
        <fieldset disabled={busy || pending || locked || conflict}>
          {creating && <label><span>Nombre original del documento</span><input required maxLength={240} value={original} onChange={e=>setOriginal(e.target.value)}/></label>}
          {(['approved_name','presentation','internal_code'] as const).map((k,i)=><label key={k}><span>{['Nombre comercial por confirmar','Presentación literal','SKU interno por confirmar'][i]}</span><input maxLength={k==='internal_code' ? 40 : k==='presentation' ? 120 : 160} value={fields[k]} onChange={e=>setFields(f=>({...f,[k]:e.target.value}))}/>{!fields[k] && <small>Pendiente</small>}</label>)}
          <label><span>Categoría</span><select aria-label="Categoría" value={fields.category_id ?? ''} onChange={e=>setFields(f=>({...f,category_id:e.target.value ? Number(e.target.value) : null}))}><option value="">Por confirmar</option>{categories.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <details><summary>Más información</summary><label><span>Nombre científico confirmado</span><input value={fields.scientific_name} onChange={e=>setFields(f=>({...f,scientific_name:e.target.value}))}/></label><label><span>Código de barras real</span><input value={fields.barcode} onChange={e=>setFields(f=>({...f,barcode:e.target.value}))}/></label><label><span>Notas de identificación</span><textarea rows={3} maxLength={2000} value={fields.description} onChange={e=>setFields(f=>({...f,description:e.target.value}))}/></label></details>
        </fieldset>
        {!locked && <button className="plants-primary" disabled={busy || pending || conflict}>Guardar avances</button>}
      </form>
      {selected && <>
        {photo && <img className="cataloging-photo" src={photo} alt="Fotografía de identificación" onError={()=>setPhotoError('No se pudo abrir la fotografía. Elige una imagen JPEG, PNG o WEBP válida.')}/>}
        {photoError && <p className="plants-warning" role="alert">{photoError}</p>}
        {!locked && <><label className="plants-file-button">Tomar foto<input type="file" capture="environment" accept="image/jpeg,image/png,image/webp" disabled={busy || pending || conflict} onChange={e=>selectPhoto(e.currentTarget)}/></label>
          <label className="plants-file-button secondary">Galería<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || pending || conflict} onChange={e=>selectPhoto(e.currentTarget)}/></label>
          {file && <div><p role="status">{photoSaving ? 'Guardando fotografía…' : 'Vista previa · fotografía seleccionada, todavía no guardada en el servidor.'}</p><button disabled={busy || pending || conflict} onClick={()=>void upload()}>Guardar fotografía</button><button disabled={busy} onClick={()=>{setFile(null);setPhotoError('')}}>Descartar foto pendiente</button></div>}
          <button disabled={busy || pending || dirty || conflict} onClick={()=>void save('SUBMIT')}>Enviar a revisión</button></>}
        <button disabled={busy || pending} onClick={()=>void consult()}>Consultar ficha actual sin borrar mi formulario</button>
        {canPublish && selected.status==='REVIEW' && <div className="plant-owner-tools"><p>Revisión y autorización: confirmar identidad y presentación antes de crear una ficha.</p><button disabled={busy || pending || conflict} onClick={()=>void save('RETURN')}>Devolver para completar</button><button disabled={busy || pending || conflict} onClick={()=>void save('PREPARE')}>Confirmar y preparar ficha inactiva</button>
          <label><span>O vincular al producto existente</span><select value={link} onChange={e=>setLink(e.target.value)}><option value="">Seleccionar después de revisar</option>{products.map(p=><option key={p.id} value={p.id}>{p.commonName} · {p.internalCode}</option>)}</select></label><button disabled={busy || pending || !link || conflict} onClick={()=>void save('LINK')}>Confirmar vínculo sin modificar producto</button></div>}
        {selected.product_id && <p>Producto #{selected.product_id}. Continúa en su ficha del catálogo para precio, foto y conteo físico aprobado mediante el flujo existente.</p>}
      </>}
    </div> : <>
      <div className="plants-filters"><label><span>Buscar nombre o SKU</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><span>Estado</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Todos</option>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label><span>Categoría</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
      <button disabled={busy} onClick={()=>void run(refresh)}>Actualizar avances</button>
      {!rows.length && <p>No hay borradores en esta selección. Puedes registrar una nueva planta.</p>}
      <div className="plants-grid">{rows.map(r=><article className="plant-card" key={r.id}><button className="plant-card-open" disabled={busy || pending} onClick={()=>open(r)}><div className="plant-card-content"><span className="plant-state">{labels[r.status]}</span><h4>{r.fields.approved_name || r.original_name}</h4><p>{r.fields.presentation || 'Presentación pendiente'} · {r.fields.internal_code || 'SKU pendiente'}</p><span className="plant-card-link">Completar ficha</span></div></button></article>)}</div>
    </>}
  </section>
}
