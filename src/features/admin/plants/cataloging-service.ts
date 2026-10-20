import { apiId, backendHttp, BackendHttpError, list, object } from '../../../lib/backend-http'
import { requireBackendAccess, backendId } from '../../auth/backend-runtime'

export interface CatalogingFields {
  approved_name: string
  presentation: string
  internal_code: string
  scientific_name: string
  description: string
  barcode: string
  category_id: number | null
  suggested_price_cents?: number | null
  initial_quantity?: number | null
}
export interface CatalogingDraft {
  id: string; original_name: string; fields: CatalogingFields; status: 'DRAFT' | 'REVIEW' | 'LINKED' | 'PREPARED'; revision: number
  product_id: string | null; has_image: boolean; updated_by: number; updated_at: string; source_evidence: unknown
  approved_by?: number | null; approved_at?: string | null
  publication?: { branch_id: number; price_cents: number; initial_quantity: number; ready: boolean; needs_initial_count?: boolean }
}
export const emptyCatalogingFields = (): CatalogingFields => ({ approved_name: '', presentation: '', internal_code: '', scientific_name: '', description: '', barcode: '', category_id: null, suggested_price_cents: null, initial_quantity: null })
export function parseCataloging(value: unknown): CatalogingDraft {
  const r = object(value), f = object(r.fields), fields = emptyCatalogingFields()
  for (const k of ['approved_name','presentation','internal_code','scientific_name','description','barcode'] as const) {
    if (f[k] !== undefined && typeof f[k] !== 'string') throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
    fields[k] = f[k] as string ?? ''
  }
  if (f.category_id !== undefined && f.category_id !== null) fields.category_id = Number(apiId(f.category_id))
  for (const k of ['suggested_price_cents', 'initial_quantity'] as const) {
    if (f[k] !== undefined && f[k] !== null) {
      if (!Number.isSafeInteger(f[k]) || Number(f[k]) < 0) throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
      fields[k] = Number(f[k])
    }
  }
  let publication: CatalogingDraft['publication']
  if (r.publication !== undefined) {
    const p = object(r.publication)
    if (!Number.isSafeInteger(p.price_cents) || Number(p.price_cents) < 0 || !Number.isSafeInteger(p.initial_quantity) || Number(p.initial_quantity) < 0 || typeof p.ready !== 'boolean') throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
    publication = { branch_id: Number(apiId(p.branch_id)), price_cents: Number(p.price_cents), initial_quantity: Number(p.initial_quantity), ready: p.ready,
      needs_initial_count: p.needs_initial_count === true }
  }
  if (typeof r.original_name !== 'string' || !['DRAFT','REVIEW','LINKED','PREPARED'].includes(String(r.status))
    || !Number.isInteger(r.revision) || Number(r.revision) < 1 || typeof r.has_image !== 'boolean' || typeof r.updated_at !== 'string') throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
  return { id:apiId(r.id), original_name:r.original_name, fields, status:r.status as CatalogingDraft['status'], revision:Number(r.revision),
    product_id:r.product_id === null ? null : apiId(r.product_id), has_image:r.has_image, updated_by:Number(apiId(r.updated_by)), updated_at:r.updated_at, source_evidence:r.source_evidence,
    approved_by: r.approved_by ? Number(apiId(r.approved_by)) : null,
    approved_at: typeof r.approved_at === 'string' ? r.approved_at : null, ...(publication ? { publication } : {}) }
}
function journalScope() {
  const { token, context }=requireBackendAccess()
  return { token, actorId:context.user.id, branchId:context.branch?.id }
}
type JournalScope = ReturnType<typeof journalScope>
function journalKey(scope: JournalScope) { return `vivero-cataloging:${scope.actorId}:${scope.branchId}` }
function requireOriginalSession(scope: JournalScope) {
  let current: JournalScope
  try { current=journalScope() }
  catch { throw new BackendHttpError(409,'CATALOGING_SESSION_CHANGED') }
  if(current.token!==scope.token || current.actorId!==scope.actorId || current.branchId!==scope.branchId) {
    throw new BackendHttpError(409,'CATALOGING_SESSION_CHANGED')
  }
}
interface Attempt { path: string; method: string; body: unknown; key: string; photo?: { base64: string; type: string; revision: number } }
export function pendingCataloging(): Attempt | null {
  // Rendering must survive expired sessions or unavailable browser storage.
  // Writes still require readable, durable storage and never replace an existing journal.
  try { const raw=localStorage.getItem(journalKey(journalScope())); return raw ? JSON.parse(raw) as Attempt : null }
  catch { return null }
}
async function sendAttempt(scope: JournalScope, storageKey: string, raw: string): Promise<CatalogingDraft> {
  const attempt=JSON.parse(raw) as Attempt
  const clearOriginal=()=>{
    // Another operation may have replaced this identity's journal while HTTP was pending.
    if(localStorage.getItem(storageKey)===raw) localStorage.removeItem(storageKey)
  }
  try {
    let response: unknown
    if (attempt.photo) {
      const bytes = Uint8Array.from(atob(attempt.photo.base64), c => c.charCodeAt(0))
      const http = await fetch(`/api/v1/${attempt.path}`, { method:'PUT', credentials:'omit', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(30000),
        headers:{Authorization:`Bearer ${scope.token}`, 'X-Expected-Actor-Id':String(scope.actorId), 'X-Expected-Branch-Id':String(scope.branchId),
          'Content-Type':attempt.photo.type, 'Idempotency-Key':attempt.key, 'X-Cataloging-Revision':String(attempt.photo.revision)}, body:bytes })
      response = await http.json()
      if (!http.ok) throw new BackendHttpError(http.status,String(object(response).error))
    } else response = await backendHttp(attempt.path,attempt.method,attempt.body,undefined,attempt.key)
    const result=parseCataloging(response)
    requireOriginalSession(scope)
    clearOriginal(); return result
  } catch(e) {
    // Keep even a confirmed result recoverable after logout or an identity change.
    requireOriginalSession(scope)
    if(e instanceof BackendHttpError && [400,404,409,413,415,422].includes(e.status)
      && !['CATALOGING_SESSION_CHANGED','CATALOGING_KEY_CONFLICT'].includes(e.code)) clearOriginal()
    throw e
  }
}
export async function saveCataloging(id: string | null, body: unknown): Promise<CatalogingDraft> {
  const scope=journalScope(), storageKey=journalKey(scope)
  if(localStorage.getItem(storageKey)) throw new Error('Comprueba el guardado pendiente antes de continuar.')
  const attempt={path:id ? `cataloging/${backendId(id)}` : 'cataloging',method:id ? 'PATCH' : 'POST',body,key:crypto.randomUUID()}
  const raw=JSON.stringify(attempt)
  localStorage.setItem(storageKey,raw) // Must succeed before sending.
  return sendAttempt(scope,storageKey,raw)
}
export interface PublishCatalogingPayload {
  revision: number
  fields?: Partial<CatalogingFields>
  price_cents?: number | null
  initial_quantity?: number | null
}
export async function publishCataloging(id: string, payload: PublishCatalogingPayload): Promise<CatalogingDraft> {
  const scope=journalScope(), storageKey=journalKey(scope)
  if(localStorage.getItem(storageKey)) throw new Error('Comprueba el guardado pendiente antes de continuar.')
  const attempt={path:`cataloging/${backendId(id)}/publish`,method:'POST',body:payload,key:crypto.randomUUID()}
  const raw=JSON.stringify(attempt)
  localStorage.setItem(storageKey,raw)
  return sendAttempt(scope,storageKey,raw)
}
export async function confirmCataloging(id: string, payload: { revision: number; fields: Partial<CatalogingFields>; price_cents: number; product_id?: number; initial_quantity?: number }): Promise<CatalogingDraft> {
  const scope=journalScope(), storageKey=journalKey(scope)
  if(localStorage.getItem(storageKey)) throw new Error('Comprueba el guardado pendiente antes de continuar.')
  const attempt={path:'plants/confirm',method:'POST',body:{target:'draft',id:Number(backendId(id)),...payload},key:crypto.randomUUID()}
  const raw=JSON.stringify(attempt)
  localStorage.setItem(storageKey,raw)
  return sendAttempt(scope,storageKey,raw)
}
function productJournalKey(scope: JournalScope) { return `${journalKey(scope)}:product` }
export function pendingProductConfirmation() {
  try { return localStorage.getItem(productJournalKey(journalScope())) !== null } catch { return false }
}
export function pendingProductAttemptKind(): 'photo' | 'confirm' | null {
  try { const raw=localStorage.getItem(productJournalKey(journalScope()));return raw ? (JSON.parse(raw) as Attempt).photo ? 'photo' : 'confirm' : null }
  catch { return null }
}
async function sendProductConfirmation(scope:JournalScope,storageKey:string,raw:string) {
  const attempt=JSON.parse(raw) as Attempt
  try {
    let result:Record<string,unknown>
    if(attempt.photo){
      const bytes=Uint8Array.from(atob(attempt.photo.base64),c=>c.charCodeAt(0))
      const response=await fetch(`/api/v1/${attempt.path}`,{method:'PUT',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),
        headers:{Authorization:`Bearer ${scope.token}`,'X-Expected-Actor-Id':String(scope.actorId),'X-Expected-Branch-Id':String(scope.branchId),
          'Content-Type':attempt.photo.type,'Idempotency-Key':attempt.key,'If-Match':`"${attempt.photo.revision}"`},body:bytes})
      result=object(await response.json())
      if(!response.ok)throw new BackendHttpError(response.status,String(result.error))
    }else result=object(await backendHttp(attempt.path,attempt.method,attempt.body,undefined,attempt.key))
    requireOriginalSession(scope)
    if(localStorage.getItem(storageKey)===raw)localStorage.removeItem(storageKey)
    return result
  }catch(e){
    requireOriginalSession(scope)
    if(e instanceof BackendHttpError && [400,404,409,413,415,422].includes(e.status)
      && !['CATALOGING_SESSION_CHANGED','CATALOGING_KEY_CONFLICT'].includes(e.code)
      && localStorage.getItem(storageKey)===raw)localStorage.removeItem(storageKey)
    throw e
  }
}
export async function confirmProduct(id:string,payload:{revision:number;fields:Record<string,unknown>;price_cents:number}) {
  if(!Number.isInteger(payload.revision)||payload.revision<1)throw new Error('Consulta la versión guardada de la ficha antes de confirmar.')
  const scope=journalScope(),storageKey=productJournalKey(scope)
  if(localStorage.getItem(storageKey))throw new Error('Comprueba la publicación pendiente antes de continuar.')
  const raw=JSON.stringify({path:'plants/confirm',method:'POST',body:{target:'product',id:Number(backendId(id)),...payload},key:crypto.randomUUID()})
  localStorage.setItem(storageKey,raw)
  return sendProductConfirmation(scope,storageKey,raw)
}
export async function recoverProductConfirmation() {
  const scope=journalScope(),storageKey=productJournalKey(scope),raw=localStorage.getItem(storageKey)
  if(!raw)throw new Error('No hay una publicación pendiente.')
  return sendProductConfirmation(scope,storageKey,raw)
}
export async function recoverCataloging() {
  const scope=journalScope(), storageKey=journalKey(scope), raw=localStorage.getItem(storageKey)
  if(!raw)throw new Error('No hay un guardado pendiente.')
  return sendAttempt(scope,storageKey,raw)
}
export async function loadCataloging(search='', status='ALL', category=''): Promise<CatalogingDraft[]> {
  const result: CatalogingDraft[]=[]; let after: number | null=null
  do {
    const q=new URLSearchParams({limit:'100',status,search}); if(after)q.set('after_id',String(after)); if(category)q.set('category_id',category)
    const data=await backendHttp(`cataloging?${q}`), rows=list(data.items).map(parseCataloging)
    if(rows.some((r,i)=>Number(r.id)<=(i ? Number(rows[i-1].id) : after ?? 0)))throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
    result.push(...rows); after=data.next_after_id===null ? null : Number(apiId(data.next_after_id))
    if(after!==null && (rows.length!==100 || after!==Number(rows.at(-1)?.id)))throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
  }while(after!==null)
  return result
}
export async function loadCatalogingDraft(id: string) { return parseCataloging(await backendHttp(`cataloging/${backendId(id)}`)) }
export async function saveCatalogingProgress(draft: CatalogingDraft, fields: CatalogingFields, photo: File | null, onSaved: (draft: CatalogingDraft) => void) {
  let saved = await saveCataloging(draft.id, { revision:draft.revision, action:'SAVE', fields })
  onSaved(saved)
  if (photo) {
    saved = parseCataloging(await catalogingBinary(`cataloging/${draft.id}/photo`,photo,saved.revision))
    onSaved(saved)
  }
  return saved
}
export function catalogingError(error: unknown) {
  if(error instanceof BackendHttpError && error.code==='CATALOGING_INPUT_INVALID')return 'No se pudo confirmar la ficha. Vuelve a abrirla para consultar su versión guardada y revisa los datos antes de confirmar.'
  if(error instanceof BackendHttpError && error.code==='CATALOGING_SESSION_CHANGED')return 'La sesión o sucursal cambió durante el guardado. El intento original se conserva; vuelve a la cuenta y sucursal originales para comprobarlo.'
  if(error instanceof BackendHttpError && error.code==='CATALOGING_EDIT_CONFLICT')return 'Otra persona guardó cambios. Consulta la ficha actual y compara antes de guardar; tu formulario se conserva.'
  if(error instanceof BackendHttpError && ['CATALOGING_PRODUCT_EXISTS','DUPLICATE'].includes(error.code))return 'Ya existe un producto con ese código. Revisa la coincidencia y vincula el existente si corresponde.'
  if(error instanceof BackendHttpError && error.code==='CATALOGING_INCOMPLETE')return 'Confirma nombre, presentación, categoría y SKU antes de preparar un producto.'
  return error instanceof Error ? error.message : 'No se confirmó el guardado.'
}
export async function catalogingBinary(path: string, file?: File, revision?: number, product=false): Promise<Blob | Record<string,unknown>> {
  if(file&&product){
    if(!/^products\/[1-9][0-9]*\/catalog-photo$/.test(path)||!Number.isInteger(revision)||Number(revision)<1)throw new Error('Ficha o revisión inválida.')
    const scope=journalScope(),storageKey=productJournalKey(scope)
    if(localStorage.getItem(storageKey))throw new Error('Comprueba la operación pendiente antes de continuar.')
    const bytes=new Uint8Array(await file.arrayBuffer())
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
    requireOriginalSession(scope)
    const raw=JSON.stringify({path,method:'PUT',body:null,key:crypto.randomUUID(),photo:{base64:btoa(binary),type:file.type,revision:Number(revision)}})
    try{localStorage.setItem(storageKey,raw)}catch{throw new Error('No hay espacio para conservar esta foto y recuperarla. Elige una foto más pequeña; todavía no se envió.')}
    return sendProductConfirmation(scope,storageKey,raw)
  }
  if (file && !product) {
    if (!/^cataloging\/[1-9][0-9]*\/photo$/.test(path) || !Number.isInteger(revision) || Number(revision)<1) throw new Error('Ficha o revisión inválida.')
    const scope=journalScope(), storageKey=journalKey(scope)
    if(localStorage.getItem(storageKey)) throw new Error('Comprueba el guardado pendiente antes de continuar.')
    const bytes=new Uint8Array(await file.arrayBuffer())
    let binary=''
    for (let i=0; i<bytes.length; i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
    requireOriginalSession(scope)
    if(localStorage.getItem(storageKey)) throw new Error('Comprueba el guardado pendiente antes de continuar.')
    const attempt: Attempt={path,method:'PUT',body:null,key:crypto.randomUUID(),photo:{base64:btoa(binary),type:file.type,revision:Number(revision)}}
    const raw=JSON.stringify(attempt)
    try { localStorage.setItem(storageKey,raw) }
    catch { throw new Error('No hay espacio para conservar esta foto y recuperarla. Elige una foto más pequeña; todavía no se envió.') }
    const saved=await sendAttempt(scope,storageKey,raw)
    // Keep the existing binary helper's API-shaped return value for its callers.
    return { ...saved, id:Number(saved.id), product_id:saved.product_id === null ? null : Number(saved.product_id) }
  }
  const {token,context}=requireBackendAccess()
  const response=await fetch(`/api/v1/${path}`,{method:file ? (product ? 'PUT' : 'PUT') : 'GET', credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),
    headers:{Authorization:`Bearer ${token}`,'X-Expected-Actor-Id':String(context.user.id),'X-Expected-Branch-Id':String(context.branch?.id),
      ...(file ? {'Content-Type':file.type,'Idempotency-Key':crypto.randomUUID(),...(product ? {'If-Match':`"${revision}"`} : {'X-Cataloging-Revision':String(revision)})} : {})},body:file})
  if(!response.ok) { const error=object(await response.json()); throw new BackendHttpError(response.status,String(error.error)) }
  return file ? object(await response.json()) : response.blob()
}
export async function productRevision(id: string) {
  const r=await backendHttp(`products/${backendId(id)}/edit-version`)
  if(apiId(r.id)!==id || !Number.isInteger(r.revision) || Number(r.revision)<1)throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
  return Number(r.revision)
}
export async function guardedProductPatch(id: string, fields: Record<string,unknown>, revision: number) {
  const {token,context}=requireBackendAccess()
  const response=await fetch(`/api/v1/products/${backendId(id)}`,{method:'PATCH',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','If-Match':`"${revision}"`,'X-Expected-Actor-Id':String(context.user.id),'X-Expected-Branch-Id':String(context.branch?.id)},body:JSON.stringify(fields)})
  const r=object(await response.json())
  if(!response.ok)throw new BackendHttpError(response.status,String(r.error))
  if(apiId(r.id)!==id)throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
}
