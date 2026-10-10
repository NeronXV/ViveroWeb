import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../../auth/backend-runtime'
import { guardedProductPatch, loadCataloging, pendingCataloging, recoverCataloging, saveCataloging, parseCataloging } from './cataloging-service'

const request=vi.fn(), store=new Map<string,string>()
const draft={id:1,original_name:'Planta sintética',fields:{presentation:'B02'},status:'DRAFT',revision:1,product_id:null,has_image:false,updated_by:4,updated_at:'2026-10-10T12:00:00Z',source_evidence:null}
beforeEach(()=>{
  request.mockReset();store.clear();vi.stubGlobal('fetch',request)
  vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)})
  bindBackendSession(()=>({session:{accessToken:'a'.repeat(43),userId:4,expiresAt:Date.now()+60000},accessStatus:'ready',context:{user:{id:4},branch:{id:2,is_active:true}}} as never))
})
afterEach(()=>vi.unstubAllGlobals())
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
