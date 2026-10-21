import { useEffect, useRef, useState } from 'react'
import './reception.css'
import type { PurchaseSourceItem, Supplier, SupplierPurchaseDetail } from './purchases-types'
import type { AdminProduct } from '../admin-catalog-types'
import { fetchAdminProducts } from '../admin-catalog-service'
import { createSupplierPurchaseDraft, fetchSupplierPurchaseDetail, confirmSupplierPurchase, recoverSupplierPurchaseDraft, recoverSupplierPurchaseConfirmation, recoverSupplierPurchaseRevision, retireSupplierPurchaseDraft, reviseSupplierPurchase, type ReceptionLine } from './purchases-service'
import { extractFromLocalDocx, extractFromLocalPdf, parseFreeTextList, parseCsv } from './purchases-extractor'
import { ReceptionPdfPreview } from './ReceptionPdfPreview'
import { ReceptionReviewTable } from './ReceptionReviewTable'
import { isPlantDescription, prepareReceptionSource, readMoney, type ReceptionReviewLine } from './reception-review'
import { SupplierCreateModal } from './SupplierCreateModal'
import { useInventoryPermissions } from '../useInventoryPermissions'
import { requireBackendAccess } from '../../auth/backend-runtime'

export interface ReceptionWizardProps {
  branch: { id:string; name:string } | null; knownSuppliers:Supplier[]; initialPurchaseId?:string|null
  onSupplierAdded:(supplier:Supplier)=>void; onCompleted:()=>void; onNavigateToCatalog?:()=>void; onCancel:()=>void
}
type Line = ReceptionReviewLine
export function ReceptionWizard({branch,knownSuppliers,initialPurchaseId,onSupplierAdded,onCompleted,onCancel}:ReceptionWizardProps) {
  const permissions=useInventoryPermissions()
  const [step,setStep]=useState(1),[supplier,setSupplier]=useState(''),[reference,setReference]=useState('')
  const [fileName,setFileName]=useState<string|null>(null),[paste,setPaste]=useState(''),[lines,setLines]=useState<Line[]>([])
  const [products,setProducts]=useState<AdminProduct[]>([])
  const [purchase,setPurchase]=useState<SupplierPurchaseDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [showSupplier,setShowSupplier]=useState(false),[complete,setComplete]=useState<SupplierPurchaseDetail|null>(null)
  const [reviewed,setReviewed]=useState(false)
  const [notice,setNotice]=useState(''),[documentTotal,setDocumentTotal]=useState('')
  const [totalRequired,setTotalRequired]=useState(false)
  const [preview,setPreview]=useState<string|null>(null)
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview])
  const [catalogReady,setCatalogReady]=useState(false)
  const draftKey=useRef(crypto.randomUUID()),confirmKey=useRef(crypto.randomUUID())
  const revisionAttempt=useRef<{id:string;revision:number;items:ReceptionLine[]}|null>(null)
  const identity=useRef(branch?.id); identity.current=branch?.id
  useEffect(()=>{let active=true;fetchAdminProducts({status:'all'}).then(p=>{if(active){setProducts(p);setCatalogReady(true)}}).catch(()=>{if(active)setError('No se pudo consultar el catálogo. Vuelve a abrir la llegada antes de vincular plantas.')});return()=>{active=false}},[])
  const restore=(d:SupplierPurchaseDetail)=>{
    setPurchase(d);setSupplier(d.supplier.id);setReference(d.externalReference??'');setFileName(d.sourceFileName)
    setLines(d.items.map(i=>({...i,productId:i.productId??'',name:i.newProduct?.name??i.suggestedCommonName??i.rawDescription.slice(0,160),presentation:i.newProduct?.presentation??i.suggestedPresentation??'',received:i.resolutionStatus==='IGNORED'?'0':String(i.quantity),documentQuantity:String(i.quantity),cost:(i.unitCostCents/100).toFixed(2),newPlant:!!i.newProduct})))
    revisionAttempt.current=null;setNotice('');setDocumentTotal('');setTotalRequired(false)
    setStep(2);setReviewed(false);if(d.status==='RECEIVED')setComplete(d)
  }
  useEffect(()=>{let active=true;if(initialPurchaseId)fetchSupplierPurchaseDetail(initialPurchaseId).then(d=>{if(active)restore(d)}).catch(()=>{if(active)setError('No se pudo recuperar la llegada.')});return()=>{active=false}},[initialPurchaseId])
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(busy||lines.length&&!complete){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[busy,lines.length,complete])
  const executing=useRef(false)
  const execute=async(action:()=>Promise<void>)=>{if(executing.current)return;executing.current=true;setBusy(true);setError('');try{await action()}catch(e){setError(e instanceof Error?e.message:'No se confirmó la operación. Comprueba el guardado.')}finally{executing.current=false;setBusy(false)}}
  const ingest=(items:PurchaseSourceItem[],warning?:string|null,total?:number)=>{
    setLines(items.map(i=>({...i,productId:'',name:i.suggestedCommonName??i.rawDescription.slice(0,160),presentation:i.suggestedPresentation??'',received:i.quantity>0?String(i.quantity):'',documentQuantity:String(i.quantity),cost:(i.unitCostCents/100).toFixed(2),newPlant:false})))
    setReviewed(false);setNotice(warning??'');setDocumentTotal(total===undefined?'':(total/100).toFixed(2));setTotalRequired(total!==undefined);if(items.length)setStep(2)
  }
  const upload=(file:File)=>execute(async()=>{
    if(file.size>10*1024*1024)throw new Error('El documento debe pesar menos de 10 MB.')
    const result=/\.docx$/i.test(file.name)?await extractFromLocalDocx(file):/\.pdf$/i.test(file.name)?await extractFromLocalPdf(file):/\.csv$/i.test(file.name)?parseCsv(await file.text()):null
    if(!result)throw new Error('Elige un PDF con texto, Word .docx o CSV con descripción, cantidad y costo unitario.')
    if(!result.items.length){setNotice(result.warning??'No se detectaron partidas. Puedes capturarlas manualmente.');return}
    setFileName(file.name);setPreview(/\.pdf$/i.test(file.name)?URL.createObjectURL(file):null)
    ingest(result.items,result.warning,result.documentTotalCents)
  })
  const update=(index:number,patch:Partial<Line>)=>{setLines(old=>old.map((l,i)=>i===index?{...l,...patch}:l));setReviewed(false);revisionAttempt.current=null}
  const save=async()=>{
    const original=requireBackendAccess()
    if(!catalogReady)throw new Error('Espera a que cargue el catálogo antes de guardar.')
    if(!supplier||!lines.length)throw new Error('Selecciona proveedor y revisa las plantas.')
    if(!reviewed)throw new Error('Compara la lista con el documento y confirma las cantidades recibidas.')
    for(const l of lines){if(!/^\d+$/.test(l.received)||Number(l.received)>1000000)throw new Error('Revisa las cantidades: enteros entre 0 y 1000000.');if(Number(l.received)>0&&!l.productId&&!l.newPlant)throw new Error('Selecciona una planta del catálogo o elige crear una ficha pendiente para cada partida recibida.');if(Number(l.received)>0&&!l.productId&&(!isPlantDescription(l.name)||l.name.trim().length<2||l.name.trim().length>160))throw new Error('Revisa el nombre de la planta nueva.');if(l.presentation.trim().length>120)throw new Error('La presentación del proveedor es demasiado larga.')}
    let d=purchase
    if(!d){
      const items=prepareReceptionSource(lines,documentTotal,totalRequired)
      d=await createSupplierPurchaseDraft({supplierId:supplier,documentDate:new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),externalReference:reference||null,paymentTerms:'OTHER',expectedTotalCents:items.reduce((s,l)=>s+l.quantity*l.unitCostCents,0),sourceFileName:fileName,items,idempotencyKey:draftKey.current})
      setPurchase(d)
    }
    const current=requireBackendAccess()
    if(original.token!==current.token||original.context.branch?.id!==current.context.branch?.id)throw new Error('Cambió la sesión. Abre la llegada desde la cuenta y sucursal originales.')
    if(!d.revision)throw new Error('Esta versión requiere actualizar el contrato de recepción del servidor.')
    const items=d.items.map((item,index)=>{const l=lines[index],q=Number(l.received);return {id:Number(item.id),quantity:q,product_id:q&&l.productId?Number(l.productId):null,new_product:q&&!l.productId?{name:l.name.trim(),presentation:l.presentation.trim()||null,category_id:null}:null}})
    const attempt=revisionAttempt.current??{id:d.id,revision:d.revision,items};revisionAttempt.current=attempt
    const result=await reviseSupplierPurchase(attempt.id,attempt.revision,attempt.items)
    revisionAttempt.current=null;setPurchase(result);return result
  }
  const confirm=()=>execute(async()=>{
    if(!purchase?.revision)throw new Error('Guarda la revisión de la llegada primero.')
    const scope=branch?.id
    const result=await confirmSupplierPurchase({purchaseId:purchase.id,confirmationKey:confirmKey.current,revision:purchase.revision})
    if(identity.current!==scope)throw new Error('La sucursal cambió. Consulta la llegada en su sucursal original.')
    setComplete(result);onCompleted()
  })
  const recover=()=>execute(async()=>{
    const d=purchase?(await recoverSupplierPurchaseRevision(purchase.id)??await recoverSupplierPurchaseConfirmation(purchase.id)):await recoverSupplierPurchaseDraft()
    if(d)restore(d);else if(purchase)restore(await fetchSupplierPurchaseDetail(purchase.id));else setError('No hay un envío pendiente. Revisa los documentos ya guardados antes de crear otro.')
  })
  const addLine=()=>{setLines(old=>[...old,{lineNumber:old.length+1,rawDescription:'',containerCode:'GEN',suggestedCommonName:null,suggestedPresentation:null,quantity:0,unitCostCents:0,productId:'',name:'',presentation:'',received:'',documentQuantity:'',cost:'0.00',newPlant:false}]);setReviewed(false);setStep(2)}
  const sourceTotal=lines.reduce((sum,l)=>sum+Number(l.documentQuantity)*(readMoney(l.cost)??NaN),0)
  const totalMatches=documentTotal.trim()!==''&&readMoney(documentTotal)!==null&&sourceTotal===readMoney(documentTotal)
  const totalBlocked=!purchase&&(totalRequired||!!documentTotal.trim())&&!totalMatches
  const knownUnits=lines.filter(l=>l.productId).reduce((sum,l)=>sum+Number(l.received),0)
  const pendingUnits=lines.filter(l=>!l.productId).reduce((sum,l)=>sum+Number(l.received),0)
  const omittedLines=lines.filter(l=>l.received==='0').length
  if(complete)return <section className="reception-wizard reception-card celebration-screen"><div className="celebration-check-icon" aria-hidden="true">✓</div><h3 className="celebration-title">Llegada registrada</h3><p className="celebration-subtitle">Las plantas identificadas se sumaron al inventario de {branch?.name}. Las nuevas quedaron con su cantidad recibida en fichas pendientes; pasarán al inventario cuando la gerente las complete o vincule.</p><div className="celebration-actions"><button type="button" className="submit-db-btn" onClick={onCancel}>Volver a llegadas</button></div></section>
  return <section className="reception-wizard reception-simple" aria-label="Registrar llegada"><h3>Registrar llegada</h3><p>Paso {step} de 3 · {['Documento','Revisar llegada','Confirmar'][step-1]}</p>
    {error&&<div role="alert"><p>{error}</p><button type="button" className="retry-btn-secondary" disabled={busy} onClick={()=>void recover()}>Comprobar guardado</button>{!purchase&&<button type="button" className="retry-btn-secondary" disabled={busy} onClick={()=>void execute(async()=>{const d=await retireSupplierPurchaseDraft();if(d)restore(d);else{draftKey.current=crypto.randomUUID();setError('Intento comprobado. Puedes corregir el documento y volver a guardar.')}})}>Resolver intento anterior</button>}</div>}
    {notice&&<p className="reception-notice" role="status">{notice}</p>}
    <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
    {step===1&&<div><label>Proveedor<select aria-label="Proveedor" disabled={!!purchase} value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Seleccionar proveedor</option>{knownSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button type="button" className="retry-btn-secondary" onClick={()=>setShowSupplier(true)}>+ Añadir proveedor</button>
      <label>Folio del documento, si tiene<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={80}/></label>
      <label>Subir PDF, Word o CSV<input type="file" accept=".pdf,.docx,.csv" disabled={!supplier||!catalogReady||!!purchase} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value=''}}/></label>
      <details><summary>Pegar o escribir lista</summary><p>Ejemplo: 10 Ficus M6 $45.00</p><textarea value={paste} onChange={e=>setPaste(e.target.value)}/><button type="button" className="retry-btn-secondary" disabled={!supplier||!catalogReady||!!purchase} onClick={()=>void execute(async()=>{const r=parseFreeTextList(paste);setFileName(null);setPreview(null);ingest(r.items,r.warning)})}>Leer lista</button></details><button type="button" className="retry-btn-secondary" disabled={!supplier||!catalogReady||!!purchase} onClick={addLine}>Capturar manualmente</button>{lines.length>0&&<button type="button" className="retry-btn-secondary" onClick={()=>setStep(2)}>Volver a revisar lista</button>}<p>PDF con texto, Word o CSV. Para fotos y escaneos, usa la captura manual. El archivo se lee en este dispositivo.</p></div>}
    {step===2&&<div><p>Compara con el documento. Selecciona cada planta existente o indica que es nueva. La cantidad debe ser lo que realmente llegó.</p>
      <div className="reception-review-layout">
        {preview&&<ReceptionPdfPreview key={preview} url={preview}/>}
        <ReceptionReviewTable lines={lines} products={products} saved={!!purchase} update={update} remove={i=>{setLines(old=>old.filter((_,index)=>index!==i));setReviewed(false)}}/>
      </div>
      {!purchase&&<><button type="button" className="retry-btn-secondary" disabled={lines.length>=100} onClick={addLine}>+ Añadir planta faltante</button>
        <div className="reception-total-review"><label>Total del documento{totalRequired?'':' (opcional)'}<input inputMode="decimal" value={documentTotal} onChange={e=>{setDocumentTotal(e.target.value);setReviewed(false)}} placeholder="Ejemplo: 1250.00" /></label>
          <p>Suma del documento: <strong>{Number.isSafeInteger(sourceTotal)?`$${(sourceTotal/100).toFixed(2)}`:'Revisa cantidades y costos'}</strong></p>
          <p role="status">{(totalRequired||documentTotal.trim())?totalMatches?'La suma coincide con el total del documento.':'La suma no coincide con el total indicado. Corrige las partidas antes de guardar.':'Sin total indicado: compara la suma y todas las partidas con el original.'}</p>
          <small>Esta comparación usa las cantidades del documento. La cantidad recibida puede ser diferente.</small>
        </div></>}
      <p>Los costos no se usan como precios de venta. Revisa también las partidas omitidas por el lector.</p>
      <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Comparé todas las plantas, cantidades y costos con la llegada real.</label>
      <button type="button" className="primary submit-db-btn" disabled={!catalogReady||!reviewed||totalBlocked} onClick={()=>void execute(async()=>{await save();setStep(3)})}>Continuar</button><button type="button" className="retry-btn-secondary" disabled={!catalogReady||!reviewed||totalBlocked} onClick={()=>void execute(async()=>{await save();onCancel()})}>Guardar y salir</button></div>}
    {step===3&&<div><p>Importe de lo recibido: <strong>${((purchase?.expectedTotalCents??0)/100).toFixed(2)}</strong></p><p>{knownUnits} unidades identificadas se sumarán al inventario de {branch?.name}.</p><p>{pendingUnits} unidades nuevas quedarán en fichas pendientes hasta que la gerente las complete.</p>{omittedLines>0&&<p>{omittedLines} {omittedLines===1?'partida con cero recibido no generará':'partidas con cero recibido no generarán'} inventario.</p>}<button type="button" className="primary submit-db-btn" disabled={!permissions.canReceive} onClick={()=>void confirm()}>Registrar llegada</button></div>}
    {step>1&&<button type="button" className="retry-btn-secondary" onClick={()=>setStep(step-1)}>Atrás</button>}<button type="button" className="retry-btn-secondary" onClick={()=>{if(!lines.length||window.confirm('¿Salir? Los cambios que no guardaste se perderán.'))onCancel()}}>Salir</button>
    </fieldset>{busy&&<p role="status">Comprobando y guardando…</p>}{showSupplier&&<SupplierCreateModal isOpen onClose={()=>setShowSupplier(false)} onCreated={s=>{onSupplierAdded(s);setSupplier(s.id);setShowSupplier(false)}}/>}
  </section>
}
