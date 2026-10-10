import { apiId, backendHttp, BackendHttpError, list, object } from '../../../lib/backend-http'
import { requireBackendAccess, backendId } from '../../auth/backend-runtime'

export interface CatalogingFields { approved_name: string; presentation: string; internal_code: string; scientific_name: string; description: string; barcode: string; category_id: number | null }
export interface CatalogingDraft {
  id: string; original_name: string; fields: CatalogingFields; status: 'DRAFT' | 'REVIEW' | 'LINKED' | 'PREPARED'; revision: number
  product_id: string | null; has_image: boolean; updated_by: number; updated_at: string; source_evidence: unknown
}
export const emptyCatalogingFields = (): CatalogingFields => ({ approved_name: '', presentation: '', internal_code: '', scientific_name: '', description: '', barcode: '', category_id: null })
export function parseCataloging(value: unknown): CatalogingDraft {
  const r = object(value), f = object(r.fields), fields = emptyCatalogingFields()
  for (const k of ['approved_name','presentation','internal_code','scientific_name','description','barcode'] as const) {
    if (f[k] !== undefined && typeof f[k] !== 'string') throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
    fields[k] = f[k] as string ?? ''
  }
  if (f.category_id !== undefined && f.category_id !== null) fields.category_id = Number(apiId(f.category_id))
  if (typeof r.original_name !== 'string' || !['DRAFT','REVIEW','LINKED','PREPARED'].includes(String(r.status))
    || !Number.isInteger(r.revision) || Number(r.revision) < 1 || typeof r.has_image !== 'boolean' || typeof r.updated_at !== 'string') throw new BackendHttpError(502,'INCOMPATIBLE_RESPONSE')
  return { id:apiId(r.id), original_name:r.original_name, fields, status:r.status as CatalogingDraft['status'], revision:Number(r.revision),
    product_id:r.product_id === null ? null : apiId(r.product_id), has_image:r.has_image, updated_by:Number(apiId(r.updated_by)), updated_at:r.updated_at, source_evidence:r.source_evidence }
}
function journalKey() { const { context }=requireBackendAccess(); return `vivero-cataloging:${context.user.id}:${context.branch?.id}` }
interface Attempt { path: string; method: string; body: unknown; key: string }
export function pendingCataloging(): Attempt | null { const raw=localStorage.getItem(journalKey()); return raw ? JSON.parse(raw) as Attempt : null }
async function sendAttempt(attempt: Attempt): Promise<CatalogingDraft> {
  try {
    const result=parseCataloging(await backendHttp(attempt.path,attempt.method,attempt.body,undefined,attempt.key))
    localStorage.removeItem(journalKey()); return result
  } catch(e) {
    if(e instanceof BackendHttpError && e.status>=400 && e.status<500) localStorage.removeItem(journalKey())
    throw e
  }
}
export async function saveCataloging(id: string | null, body: unknown): Promise<CatalogingDraft> {
  if(pendingCataloging()) throw new Error('Comprueba el guardado pendiente antes de continuar.')
  const attempt={path:id ? `cataloging/${backendId(id)}` : 'cataloging',method:id ? 'PATCH' : 'POST',body,key:crypto.randomUUID()}
  localStorage.setItem(journalKey(),JSON.stringify(attempt)) // Must succeed before sending.
  return sendAttempt(attempt)
}
export async function recoverCataloging() { const attempt=pendingCataloging(); if(!attempt)throw new Error('No hay un guardado pendiente.'); return sendAttempt(attempt) }
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
export function catalogingError(error: unknown) {
  if(error instanceof BackendHttpError && error.code==='CATALOGING_EDIT_CONFLICT')return 'Otra persona guardó cambios. Consulta la ficha actual y compara antes de guardar; tu formulario se conserva.'
  if(error instanceof BackendHttpError && ['CATALOGING_PRODUCT_EXISTS','DUPLICATE'].includes(error.code))return 'Ya existe un producto con ese código. Revisa la coincidencia y vincula el existente si corresponde.'
  if(error instanceof BackendHttpError && error.code==='CATALOGING_INCOMPLETE')return 'Confirma nombre, presentación, categoría y SKU antes de preparar un producto.'
  return error instanceof Error ? error.message : 'No se confirmó el guardado.'
}
export async function catalogingBinary(path: string, file?: File, revision?: number, product=false): Promise<Blob | Record<string,unknown>> {
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
