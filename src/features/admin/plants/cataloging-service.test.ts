import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../../auth/backend-runtime'
import { catalogingError, guardedProductPatch, loadCataloging, pendingCataloging, recoverCataloging, saveCataloging, parseCataloging } from './cataloging-service'

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
