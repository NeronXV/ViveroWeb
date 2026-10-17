import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindBackendSession } from '../../auth/backend-runtime'
import { reviseSupplierPurchase, recoverSupplierPurchaseRevision } from './purchases-service'
import { parseLineTokens } from './purchases-extractor'

const fetcher=vi.fn(),storage=new Map<string,string>()
let unbind=()=>{}
const line={id:1,quantity:4,product_id:null,new_product:{name:'Ficus',presentation:'M6',category_id:1}}
const receipt={schema_version:1,purchase:{id:1,branch_id:2,revision:2,supplier:{id:1,name:'Proveedor sintético',code:'TEST'},document_date:'2026-10-15',external_reference:null,payment_terms:'OTHER',expected_total_cents:400,status:'DRAFT',item_count:1,unmatched_count:1,source_file_name:'test.pdf',created_at:'2026-10-15T12:00:00Z',received_at:null,items:[{...line,line_number:1,raw_description:'Ficus M6',supplier_container_code:'M6',supplier_presentation:null,suggested_common_name:null,suggested_presentation:null,unit_cost_cents:100,line_total_cents:400,resolution_status:'UNMATCHED'}]}}
beforeEach(()=>{
  storage.clear();fetcher.mockReset()
  vi.stubGlobal('fetch',fetcher)
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)})
  vi.stubGlobal('navigator',{locks:{request:async(_k:string,fn:()=>Promise<unknown>)=>fn()}})
  unbind=bindBackendSession(()=>({session:{accessToken:'a'.repeat(43),userId:4,expiresAt:Date.now()+60000},accessStatus:'ready',context:{user:{id:4},branch:{id:2,is_active:true}}} as never))
})
afterEach(()=>{unbind();vi.unstubAllGlobals()})
it('recovers exact revised quantities and new-plant data after a lost response',async()=>{
  fetcher.mockRejectedValueOnce(new Error('Lost response'))
  await expect(reviseSupplierPurchase('1',1,[line])).rejects.toThrow()
  fetcher.mockResolvedValueOnce(Response.json(receipt))
  const recovered=await recoverSupplierPurchaseRevision('1')
  expect(recovered?.items[0].newProduct).toEqual({name:'Ficus',presentation:'M6',categoryId:'1'})
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
  expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key'])
  expect(storage.size).toBe(0)
})
it('retains uncertain edits and blocks a changed payload',async()=>{
  fetcher.mockResolvedValueOnce(Response.json({error:'TEMPORARILY_UNAVAILABLE'},{status:503}))
  await expect(reviseSupplierPurchase('1',1,[line])).rejects.toThrow()
  await expect(reviseSupplierPurchase('1',1,[{...line,quantity:8}])).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(1);expect(storage.size).toBe(1)
})
it('archives a definitive revision conflict so the current document can be loaded',async()=>{
  fetcher.mockResolvedValueOnce(Response.json({error:'PURCHASE_EDIT_CONFLICT'},{status:409}))
  await expect(reviseSupplierPurchase('1',1,[line])).rejects.toThrow('cambió')
  expect(await recoverSupplierPurchaseRevision('1')).toBeNull()
  expect([...storage.keys()].every(k=>k.includes(':rejected:'))).toBe(true)
})
it('does not invent quantity from a missing or malformed column',()=>{
  expect(parseLineTokens(['Ficus','M6','$25.00'])?.quantity).toBe(0)
  expect(parseLineTokens(['Ficus','M6','1.5','$25.00'])?.quantity).toBe(0)
  expect(parseLineTokens(['Ficus','0'])?.quantity).toBe(0)
})
it('recovers a new unclassified plant and a zero-quantity line without changing the attempt',async()=>{
  const staged={...line,new_product:{name:'Ficus',presentation:null,category_id:null}}
  const zero={id:2,quantity:0,product_id:null,new_product:null}
  fetcher.mockRejectedValueOnce(new Error('Lost response'))
  await expect(reviseSupplierPurchase('1',1,[staged,zero])).rejects.toThrow()
  fetcher.mockResolvedValueOnce(Response.json({...receipt,purchase:{...receipt.purchase,item_count:2,items:[
    {...receipt.purchase.items[0],new_product:staged.new_product},
    {...receipt.purchase.items[0],id:2,line_number:2,quantity:0,line_total_cents:0,new_product:null,resolution_status:'IGNORED'},
  ]}}))
  const recovered=await recoverSupplierPurchaseRevision('1')
  expect(recovered?.items[0].newProduct).toEqual({name:'Ficus',presentation:null,categoryId:null})
  expect(recovered?.items[1].resolutionStatus).toBe('IGNORED')
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
})
