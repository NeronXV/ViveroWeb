import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../../auth/backend-runtime'
import { catalogingBinary, saveCatalogingProgress, catalogingError, guardedProductPatch, loadCataloging, pendingCataloging, recoverCataloging, saveCataloging, parseCataloging, publishCataloging, confirmCataloging, confirmProduct, recoverProductConfirmation, pendingProductConfirmation, pendingProductAttemptKind } from './cataloging-service'

const request=vi.fn(), store=new Map<string,string>()
const draft={id:1,original_name:'Planta sintética',fields:{presentation:'B02'},status:'DRAFT',revision:1,product_id:null,has_image:false,updated_by:4,updated_at:'2026-10-10T12:00:00Z',source_evidence:null}
let unbindSession=()=>{}
function session(actorId=4,branchId=2,token='a'.repeat(43)) {
  unbindSession()
  unbindSession=bindBackendSession(()=>({session:{accessToken:token,userId:actorId,expiresAt:Date.now()+60000},accessStatus:'ready',context:{user:{id:actorId},branch:{id:branchId,is_active:true}}} as never))
}
function deferredResponse() {
  let resolve!: (value: Response)=>void, reject!: (reason: Error)=>void
  const promise=new Promise<Response>((done,fail)=>{resolve=done;reject=fail})
  return {promise,resolve,reject}
}
const originalJournal='vivero-cataloging:4:2'
const otherAttempt=JSON.stringify({path:'cataloging/2',method:'PATCH',body:{revision:1,action:'SAVE',fields:{presentation:'Otra ficha'}},key:'synthetic-other-attempt'})
beforeEach(()=>{
  request.mockReset();store.clear();vi.stubGlobal('fetch',request)
  vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)})
  session()
})
afterEach(()=>{unbindSession();vi.unstubAllGlobals()})
it.each([401,403,408,429,503])('retains uncertain operation after HTTP %s and recovers the original key',async(status)=>{
  request.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(publishCataloging('1',{revision:1,price_cents:12500,initial_quantity:7})).rejects.toThrow()
  const original=pendingCataloging()
  request.mockResolvedValueOnce(Response.json({error:'TEMPORARILY_UNAVAILABLE'},{status}))
  await expect(recoverCataloging()).rejects.toThrow()
  expect(pendingCataloging()).toEqual(original)
  request.mockResolvedValueOnce(Response.json({...draft,status:'PREPARED',product_id:9,revision:2,publication:{branch_id:2,price_cents:12500,initial_quantity:7,ready:true}}))
  expect((await recoverCataloging()).publication?.ready).toBe(true)
  expect(pendingCataloging()).toBeNull()
})
it('recovers a photo with identical bytes, MIME, revision and key after loss',async()=>{
  const file=new File([new Uint8Array([0,255,127,1])],'synthetic.png',{type:'image/png'})
  request.mockRejectedValueOnce(new Error('Lost photo response'))
  await expect(catalogingBinary('cataloging/1/photo',file,1)).rejects.toThrow()
  const original=pendingCataloging()
  expect(original?.photo?.revision).toBe(1)
  request.mockResolvedValueOnce(Response.json({...draft,revision:2,has_image:true}))
  expect((await recoverCataloging()).has_image).toBe(true)
  expect(request.mock.calls[1][1].body).toEqual(request.mock.calls[0][1].body)
  expect(request.mock.calls[1][1].headers).toEqual(request.mock.calls[0][1].headers)
  expect(pendingCataloging()).toBeNull()
})
it('does not upload a photo if durable recovery storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}})
  await expect(catalogingBinary('cataloging/1/photo',new File(['synthetic'],'p.png',{type:'image/png'}),1)).rejects.toThrow('todavía no se envió')
  expect(request).not.toHaveBeenCalled()
})
it('unavailable journal storage does not crash rendering or allow an unprotected write',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('Storage unavailable')}})
  expect(pendingCataloging()).toBeNull()
  await expect(saveCataloging(null,{original_name:'Synthetic',fields:{}})).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})
it('save and exit saves commercial fields before photo, using the returned revision',async()=>{
  const initial=parseCataloging(draft),fields={...initial.fields,suggested_price_cents:12500,initial_quantity:0}
  const changed=vi.fn()
  request.mockResolvedValueOnce(Response.json({...draft,fields,revision:2})).mockResolvedValueOnce(Response.json({...draft,fields,revision:3,has_image:true}))
  const result=await saveCatalogingProgress(initial,fields,new File(['photo'],'p.png',{type:'image/png'}),changed)
  expect(JSON.parse(request.mock.calls[0][1].body).fields).toMatchObject({suggested_price_cents:12500,initial_quantity:0})
  expect(request.mock.calls[1][1].headers['X-Cataloging-Revision']).toBe('2')
  expect(changed.mock.calls.map(c=>c[0].revision)).toEqual([2,3])
  expect(result.has_image).toBe(true)
})
it('save and exit preserves the committed revision and journal when photo response is lost',async()=>{
  const initial=parseCataloging(draft),changed=vi.fn()
  request.mockResolvedValueOnce(Response.json({...draft,revision:2})).mockRejectedValueOnce(new Error('Lost response'))
  await expect(saveCatalogingProgress(initial,initial.fields,new File(['photo'],'p.png',{type:'image/png'}),changed)).rejects.toThrow()
  expect(changed).toHaveBeenCalledOnce();expect(changed.mock.calls[0][0].revision).toBe(2)
  expect(pendingCataloging()?.photo?.revision).toBe(2)
})
it.each([NaN,-1,1.1,'100'])('rejects invalid commercial fields in an API response: %s',value=>{
  expect(()=>parseCataloging({...draft,fields:{suggested_price_cents:value}})).toThrow()
  expect(()=>parseCataloging({...draft,fields:{initial_quantity:value}})).toThrow()
})
it('keeps uncertain create and retries exactly the same key/body after response loss',async()=>{
  request.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(Response.json(draft))
  await expect(saveCataloging(null,{original_name:'Planta sintética',fields:{}})).rejects.toThrow()
  const pending=pendingCataloging();expect(pending).not.toBeNull()
  await expect(saveCataloging(null,{})).rejects.toThrow('pendiente')
  expect((await recoverCataloging()).id).toBe('1')
  expect(request.mock.calls[0][1].headers['Idempotency-Key']).toBe(request.mock.calls[1][1].headers['Idempotency-Key'])
  expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body)
  expect(pendingCataloging()).toBeNull()
})
it('recovers unified draft confirmation without sending any stock quantity',async()=>{
  request.mockRejectedValueOnce(new Error('Lost response'))
  await expect(confirmCataloging('1',{revision:1,fields:{approved_name:'Planta sintética'},price_cents:12500})).rejects.toThrow()
  const sent=JSON.parse(request.mock.calls[0][1].body)
  expect(sent).toMatchObject({target:'draft',id:1,price_cents:12500})
  expect(sent).not.toHaveProperty('initial_quantity')
  request.mockResolvedValueOnce(Response.json({...draft,status:'PREPARED',revision:2,product_id:9,publication:{branch_id:2,price_cents:12500,initial_quantity:0,ready:false,needs_initial_count:true}}))
  expect((await recoverCataloging()).publication?.needs_initial_count).toBe(true)
  expect(request.mock.calls[0][1].headers['Idempotency-Key']).toBe(request.mock.calls[1][1].headers['Idempotency-Key'])
})
it('recovers unified product confirmation with the same durable body and key',async()=>{
  request.mockRejectedValueOnce(new Error('Lost response'))
  const payload={revision:3,fields:{common_name:'Planta sintética · M06'},price_cents:12500}
  await expect(confirmProduct('9',payload)).rejects.toThrow()
  expect(pendingProductConfirmation()).toBe(true)
  request.mockResolvedValueOnce(Response.json({id:9,ready:true,revision:4}))
  expect((await recoverProductConfirmation()).ready).toBe(true)
  expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body)
  expect(request.mock.calls[0][1].headers['Idempotency-Key']).toBe(request.mock.calls[1][1].headers['Idempotency-Key'])
  expect(pendingProductConfirmation()).toBe(false)
})
it('recovers a product photo with the same bytes, version and key',async()=>{
  const photo=new File([new Uint8Array([1,2,3,4])],'plant.png',{type:'image/png'})
  request.mockRejectedValueOnce(new Error('Lost photo response'))
  await expect(catalogingBinary('products/9/catalog-photo',photo,3,true)).rejects.toThrow()
  expect(pendingProductAttemptKind()).toBe('photo')
  request.mockResolvedValueOnce(Response.json({id:8,revision:4}))
  await recoverProductConfirmation()
  expect(request.mock.calls[0][1].body).toEqual(request.mock.calls[1][1].body)
  expect(request.mock.calls[0][1].headers['If-Match']).toBe('"3"')
  expect(request.mock.calls[0][1].headers['Idempotency-Key']).toBe(request.mock.calls[1][1].headers['Idempotency-Key'])
  expect(pendingProductConfirmation()).toBe(false)
})
const identityChanges=[
  {change:'user',actorId:5,branchId:2},
  {change:'branch',actorId:4,branchId:3},
  {change:'logout',actorId:null,branchId:null},
]
const lateResponses=['success','rejection','lost response'] as const
it.each(identityChanges.flatMap(identity=>lateResponses.map(outcome=>({...identity,outcome}))))(
  'preserves the original and other journals after $change with a late $outcome',async({actorId,branchId,outcome})=>{
    const response=deferredResponse()
    request.mockReturnValueOnce(response.promise)
    const operation=saveCataloging(null,{original_name:'Planta sintética',fields:{presentation:'B02'}})
    const original=store.get(originalJournal)
    const sent=request.mock.calls[0][1]
    expect(sent.headers['X-Expected-Actor-Id']).toBe('4')
    expect(sent.headers['X-Expected-Branch-Id']).toBe('2')
    expect(original).toBeDefined()
    const otherJournal=`vivero-cataloging:${actorId ?? 5}:${branchId ?? 3}`
    store.set(otherJournal,otherAttempt)
    if(actorId===null || branchId===null) unbindSession()
    else session(actorId,branchId,'b'.repeat(43))
    const rejected=expect(operation).rejects.toMatchObject({code:'CATALOGING_SESSION_CHANGED'})
    if(outcome==='lost response') response.reject(new Error('Connection lost'))
    else response.resolve(outcome==='success' ? Response.json(draft) : Response.json({error:'CATALOGING_EDIT_CONFLICT'},{status:409}))
    await rejected
    expect(store.get(originalJournal)).toBe(original)
    expect(store.get(otherJournal)).toBe(otherAttempt)
    expect(request).toHaveBeenCalledTimes(1)
  },
)
it('ignores a late success after re-login by the same actor and branch',async()=>{
  const response=deferredResponse()
  request.mockReturnValueOnce(response.promise)
  const operation=saveCataloging(null,{original_name:'Planta sintética',fields:{}})
  const original=store.get(originalJournal)
  session(4,2,'b'.repeat(43))
  const rejected=expect(operation).rejects.toMatchObject({code:'CATALOGING_SESSION_CHANGED'})
  response.resolve(Response.json(draft))
  await rejected
  expect(store.get(originalJournal)).toBe(original)
})
it('recovers the original key and body after returning to its identity without deleting another pending',async()=>{
  const response=deferredResponse()
  request.mockReturnValueOnce(response.promise)
  const operation=saveCataloging(null,{original_name:'Planta sintética',fields:{presentation:'B02'}})
  const original=store.get(originalJournal)
  session(5,3,'b'.repeat(43))
  const otherJournal='vivero-cataloging:5:3'
  store.set(otherJournal,otherAttempt)
  const rejected=expect(operation).rejects.toMatchObject({code:'CATALOGING_SESSION_CHANGED'})
  response.resolve(Response.json(draft))
  await rejected
  expect(pendingCataloging()?.key).toBe('synthetic-other-attempt')
  session(4,2,'c'.repeat(43))
  expect(store.get(originalJournal)).toBe(original)
  request.mockResolvedValueOnce(Response.json(draft))
  expect((await recoverCataloging()).id).toBe('1')
  expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0])
  expect(request.mock.calls[1][1].body).toBe(request.mock.calls[0][1].body)
  expect(request.mock.calls[1][1].headers['Idempotency-Key']).toBe(request.mock.calls[0][1].headers['Idempotency-Key'])
  expect(request.mock.calls[1][1].headers['X-Expected-Actor-Id']).toBe('4')
  expect(request.mock.calls[1][1].headers['X-Expected-Branch-Id']).toBe('2')
  expect(pendingCataloging()).toBeNull()
  expect(store.get(otherJournal)).toBe(otherAttempt)
})
it('preserves a recovery already in flight when its branch changes',async()=>{
  store.set(originalJournal,otherAttempt)
  const response=deferredResponse()
  request.mockReturnValueOnce(response.promise)
  const operation=recoverCataloging()
  session(4,3)
  const otherJournal='vivero-cataloging:4:3'
  store.set(otherJournal,otherAttempt)
  const rejected=expect(operation).rejects.toMatchObject({code:'CATALOGING_SESSION_CHANGED'})
  response.resolve(Response.json(draft))
  await rejected
  expect(store.get(originalJournal)).toBe(otherAttempt)
  expect(store.get(otherJournal)).toBe(otherAttempt)
})
it.each([200,409])('does not remove a replacement attempt in the same journal on HTTP %s',async(status)=>{
  const response=deferredResponse()
  request.mockReturnValueOnce(response.promise)
  const operation=saveCataloging(null,{original_name:'Planta sintética',fields:{}})
  store.set(originalJournal,otherAttempt)
  const settled=status===200 ? expect(operation).resolves.toMatchObject({id:'1'}) : expect(operation).rejects.toMatchObject({code:'CATALOGING_EDIT_CONFLICT'})
  response.resolve(status===200 ? Response.json(draft) : Response.json({error:'CATALOGING_EDIT_CONFLICT'},{status}))
  await settled
  expect(store.get(originalJournal)).toBe(otherAttempt)
})
it('clears only its original journal on a definitive rejection in the same session',async()=>{
  const otherJournal='vivero-cataloging:5:3'
  store.set(otherJournal,otherAttempt)
  request.mockResolvedValueOnce(Response.json({error:'CATALOGING_EDIT_CONFLICT'},{status:409}))
  await expect(saveCataloging('1',{revision:1,action:'SAVE',fields:{}})).rejects.toMatchObject({code:'CATALOGING_EDIT_CONFLICT'})
  expect(store.has(originalJournal)).toBe(false)
  expect(store.get(otherJournal)).toBe(otherAttempt)
})
it('explains that a changed session must recover from the original account and branch',async()=>{
  const response=deferredResponse()
  request.mockReturnValueOnce(response.promise)
  const operation=saveCataloging(null,{original_name:'Planta sintética',fields:{}})
  unbindSession()
  const rejected=expect(operation).rejects.toMatchObject({code:'CATALOGING_SESSION_CHANGED'})
  response.resolve(Response.json(draft))
  await rejected
  await operation.catch(error=>expect(catalogingError(error)).toContain('cuenta y sucursal originales'))
})
it('does not send mutations if the recovery journal cannot be persisted',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('Storage unavailable')}})
  await expect(saveCataloging(null,{})).rejects.toThrow('Storage unavailable')
  expect(request).not.toHaveBeenCalled()
})
it('surfaces edit conflicts without silently retrying and sends the base version',async()=>{
  request.mockResolvedValueOnce(Response.json({error:'CATALOGING_EDIT_CONFLICT'},{status:409}))
  await expect(guardedProductPatch('1',{common_name:'Changed'},3)).rejects.toMatchObject({code:'CATALOGING_EDIT_CONFLICT'})
  expect(request.mock.calls[0][1].headers['If-Match']).toBe('"3"')
  expect(request).toHaveBeenCalledTimes(1)
})
it('rejects impossible draft state and cursor rather than dropping pending records',async()=>{
  expect(()=>parseCataloging({...draft,revision:0})).toThrow()
  request.mockResolvedValueOnce(Response.json({items:[draft],next_after_id:2}))
  await expect(loadCataloging()).rejects.toMatchObject({code:'INCOMPATIBLE_RESPONSE'})
})
it('publishes draft atomically via publishCataloging', async () => {
  const publishedDraft = { ...draft, status: 'PREPARED', product_id: 10, approved_by: 4, approved_at: '2026-10-14T18:00:00Z' }
  request.mockResolvedValueOnce(Response.json(publishedDraft))
  const result = await publishCataloging('1', { revision: 1, fields: { approved_name: 'Ficus' }, price_cents: 10000, initial_quantity: 5 })
  expect(result.status).toBe('PREPARED')
  expect(result.product_id).toBe('10')
  expect(request.mock.calls[0][0]).toBe('/api/v1/cataloging/1/publish')
  expect(request.mock.calls[0][1].method).toBe('POST')
  const body = JSON.parse(request.mock.calls[0][1].body)
  expect(body.price_cents).toBe(10000)
  expect(body.initial_quantity).toBe(5)
})
