import { expect, it, vi } from 'vitest'
import { createBackendOrderCoordinator } from './backend-order-coordinator'
import { BackendOrderError, createBackendOrderAttempt, createBackendOrderService, readBackendOrderAttempt, readBackendOrderTicket, saveBackendOrderAttempt, type BackendOrderTicket } from './backend-order-service'

const input = { branch_id: 1, items: [{ product_id: 2, quantity: 3 }], customer_name: 'Demo cliente', customer_email: 'demo@example.invalid', customer_phone: null, notes: null, expected_total_cents: 240 }
const receipt = { schema_version: 1, id: 4, order_number: 'VW-4', status: 'PENDING', total_cents: 240, created_at: '2026-10-01T12:00:00.000000Z', idempotent_replay: false }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, clear: () => values.clear(), key: () => null, get length() { return values.size } }
}
const lock = <T>(work: () => Promise<T>) => work()
const ticket: BackendOrderTicket = { schema_version:1, order:{...receipt,schema_version:1,status:'PENDING'}, branch:{id:1,code:'TEST',name:'Sucursal sintética'},
  subtotal_cents:300,discount_cents:60,items:[{product_id:2,product_name:'Planta sintética',quantity:3,list_price_cents:100,unit_price_cents:80,line_total_cents:240}] }
const response = (value: unknown, status=200) => Response.json(value,{status})
function serialLock() {
  let tail=Promise.resolve()
  return <T>(work:()=>Promise<T>):Promise<T>=>{
    const result=tail.then(work)
    tail=result.then(()=>{},()=>{})
    return result
  }
}
const definitiveRejections=[
  {code:'WEB_ORDER_CUSTOMER_INVALID',status:400}, {code:'WEB_ORDER_INVALID',status:400}, {code:'WEB_ORDER_ITEMS_INVALID',status:400},
  {code:'WEB_ORDER_TOTAL_INVALID',status:409}, {code:'WEB_ORDER_PRICE_CHANGED',status:409},
  {code:'WEB_ORDER_BRANCH_UNAVAILABLE',status:409}, {code:'WEB_ORDER_ITEMS_UNAVAILABLE',status:409},
]
it.each(definitiveRejections)('retires only the original after an authoritative $code submission rejection',async({code,status})=>{
  const saved=storage(), attempt=createBackendOrderAttempt(input)
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:code},status))
  await expect(createBackendOrderCoordinator(saved,createBackendOrderService(request),lock).send(attempt)).rejects.toMatchObject({code})
  expect(readBackendOrderAttempt(saved)).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})
it('permits an invalid phone to be corrected with a new quote/key and creates only one accepted order',async()=>{
  const saved=storage(), invalid=createBackendOrderAttempt({...input,customer_phone:'abc',customer_email:null})
  let accepted=0
  const request=vi.fn<typeof fetch>(async(url,options)=>{
    if(String(url).endsWith('/quote')) return response({schema_version:1,branch_id:1,subtotal_cents:300,discount_cents:60,total_cents:240,
      items:[{...ticket.items[0],internal_code:'TEST',promotion_id:1,promotion_name:'Oferta sintética'}]})
    const body=JSON.parse(String(options?.body))
    if(body.customer_phone==='abc') return response({error:'WEB_ORDER_CUSTOMER_INVALID'},400)
    accepted++;return response(receipt,201)
  })
  const service=createBackendOrderService(request), coordinator=createBackendOrderCoordinator(saved,service,lock)
  await expect(coordinator.send(invalid)).rejects.toMatchObject({code:'WEB_ORDER_CUSTOMER_INVALID'})
  expect(readBackendOrderAttempt(saved)).toBeNull()
  const quote=await service.quote({branch_id:1,items:input.items})
  const corrected=createBackendOrderAttempt({...input,customer_phone:'55555555',customer_email:null,expected_total_cents:quote.total_cents})
  expect(corrected.key).not.toBe(invalid.key)
  await expect(coordinator.send(corrected)).resolves.toMatchObject({id:4})
  expect(accepted).toBe(1)
  expect(request.mock.calls.map(([url])=>url)).toEqual(['/api/v1/web-orders','/api/v1/web-orders/quote','/api/v1/web-orders'])
})
it.each(['WEB_ORDER_PRICE_CHANGED','WEB_ORDER_ITEMS_UNAVAILABLE'])('allows changed content after $code while preserving the cart outside the attempt',async(code)=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  const changedInput=code==='WEB_ORDER_PRICE_CHANGED' ? {...input,expected_total_cents:300} : {...input,items:[{product_id:3,quantity:1}]}
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:code},409))
    .mockResolvedValueOnce(response({...receipt,total_cents:changedInput.expected_total_cents},201))
  const coordinator=createBackendOrderCoordinator(saved,createBackendOrderService(request),lock)
  saved.setItem('viveroweb_public_cart_backend_v1','synthetic cart retained')
  await expect(coordinator.send(original)).rejects.toMatchObject({code})
  const corrected=createBackendOrderAttempt(changedInput)
  await coordinator.send(corrected)
  expect(request.mock.calls[1][1]?.body).toBe(corrected.body)
  expect(saved.getItem('viveroweb_public_cart_backend_v1')).toBe('synthetic cart retained')
})
it('keeps a reload-recovered attempt after 404 alone, and retires it only after rejection of its original POST',async()=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved,original)
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:'WEB_ORDER_NOT_FOUND'},404))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response({error:'WEB_ORDER_NOT_FOUND'},404))
    .mockResolvedValueOnce(response({error:'WEB_ORDER_PRICE_CHANGED'},409))
  const coordinator=createBackendOrderCoordinator(saved,createBackendOrderService(request),lock)
  const reopened=readBackendOrderAttempt(saved)!
  await expect(coordinator.recover(reopened)).rejects.toMatchObject({resultUncertain:true})
  expect(readBackendOrderAttempt(saved)).toEqual(original)
  await expect(coordinator.recover(readBackendOrderAttempt(saved)!)).rejects.toMatchObject({code:'WEB_ORDER_PRICE_CHANGED'})
  expect(readBackendOrderAttempt(saved)).toBeNull()
  for(const index of [1,3]){
    expect(request.mock.calls[index][1]?.body).toBe(original.body)
    expect(request.mock.calls[index][1]?.headers).toMatchObject({'Idempotency-Key':original.key})
  }
})
it.each([
  {code:'WEB_ORDER_IDEMPOTENCY_CONFLICT',status:409}, {code:'WEB_ORDER_NOT_FOUND',status:404},
  {code:'WEB_ORDER_CUSTOMER_INVALID',status:503}, {code:'WEB_ORDER_PRICE_CHANGED',status:400},
  {code:'WEB_ORDER_RATE_LIMITED',status:429}, {code:'WEB_ORDER_BUSY',status:503},
  {code:'BROWSER_ORIGIN_FORBIDDEN',status:403}, {code:'UNKNOWN_ERROR',status:400},
])('preserves $code / HTTP $status instead of assuming rejection',async({code,status})=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:code},status))
  await expect(createBackendOrderCoordinator(saved,createBackendOrderService(request),lock).send(original)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(original)
})
it('never treats recovery-route rejection as evidence against the original submission',async()=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved,original)
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:'WEB_ORDER_CUSTOMER_INVALID'},400))
  await expect(createBackendOrderCoordinator(saved,createBackendOrderService(request),lock).recover(original)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(original)
  expect(request).toHaveBeenCalledTimes(1)
})
it('does not clear another attempt if the durable record changed during a rejected POST',async()=>{
  const saved=storage(), original=createBackendOrderAttempt(input), replacement=createBackendOrderAttempt({...input,customer_name:'Otro cliente'})
  const request=vi.fn<typeof fetch>(async()=>{
    saveBackendOrderAttempt(saved,replacement)
    return response({error:'WEB_ORDER_CUSTOMER_INVALID'},400)
  })
  await expect(createBackendOrderCoordinator(saved,createBackendOrderService(request),lock).send(original)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(replacement)
})
it('fails closed if a definitively rejected attempt cannot be removed',async()=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  saved.removeItem=()=>{throw new Error('storage unavailable')}
  const request=vi.fn<typeof fetch>().mockResolvedValueOnce(response({error:'WEB_ORDER_CUSTOMER_INVALID'},400))
  await expect(createBackendOrderCoordinator(saved,createBackendOrderService(request),lock).send(original)).rejects.toThrow('storage unavailable')
  expect(readBackendOrderAttempt(saved)).toEqual(original)
})
it('serializes two tabs and prevents a queued or stale confirmation from creating a second order',async()=>{
  const saved=storage(), sharedLock=serialLock()
  let accepted=0
  const request=vi.fn<typeof fetch>(async(url)=>{
    if(String(url).endsWith('/ticket'))return response(ticket)
    accepted++;return response(receipt,201)
  })
  const first=createBackendOrderCoordinator(saved,createBackendOrderService(request,true),sharedLock)
  const second=createBackendOrderCoordinator(saved,createBackendOrderService(request,true),sharedLock)
  const results=await Promise.allSettled([first.send(createBackendOrderAttempt(input),null),second.send(createBackendOrderAttempt(input),null)])
  expect(results[0].status).toBe('fulfilled')
  expect(results[1]).toMatchObject({status:'rejected',reason:{code:'ORDER_CONFIRMED_IN_ANOTHER_TAB'}})
  await expect(second.send(createBackendOrderAttempt(input),null)).rejects.toMatchObject({code:'ORDER_CONFIRMED_IN_ANOTHER_TAB'})
  expect(accepted).toBe(1)
  expect(readBackendOrderTicket(saved)).toEqual(ticket)
})
it('serializes recovery across two tabs and reuses the key after a lost successful response',async()=>{
  const saved=storage(), sharedLock=serialLock(), original=createBackendOrderAttempt(input)
  let accepted=0
  const request=vi.fn<typeof fetch>(async(url)=>{
    if(String(url).endsWith('/recover'))return response(receipt)
    if(String(url).endsWith('/ticket'))return response(ticket)
    accepted++;throw new Error('response lost after acceptance')
  })
  const first=createBackendOrderCoordinator(saved,createBackendOrderService(request,true),sharedLock)
  const second=createBackendOrderCoordinator(saved,createBackendOrderService(request,true),sharedLock)
  await expect(first.send(original)).rejects.toMatchObject({resultUncertain:true})
  const results=await Promise.allSettled([first.recover(readBackendOrderAttempt(saved)!),second.recover(readBackendOrderAttempt(saved)!)])
  expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected')
  expect(accepted).toBe(1)
  expect(request.mock.calls.every(([,options])=>(options?.headers as Record<string,string>)['Idempotency-Key']===original.key)).toBe(true)
  expect(readBackendOrderAttempt(saved)).toBeNull()
})
it('requires the exact HTTP not-found status before replaying a recovery',async()=>{
  const saved=storage(), original=createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved,original)
  const service=createBackendOrderService(vi.fn())
  vi.spyOn(service,'recover').mockRejectedValue(new BackendOrderError('WEB_ORDER_NOT_FOUND',false,503))
  const submit=vi.spyOn(service,'submit')
  await expect(createBackendOrderCoordinator(saved,service,lock).recover(original)).rejects.toThrow()
  expect(submit).not.toHaveBeenCalled();expect(readBackendOrderAttempt(saved)).toEqual(original)
})
it('persists the original before POST and retains it on a lost response', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  const request = vi.fn<typeof fetch>(async () => { expect(readBackendOrderAttempt(saved)).toEqual(attempt); throw new Error('offline') })
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).send(attempt)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).send(createBackendOrderAttempt(input))).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})
it('never posts if persistence or exclusive ownership fails', async () => {
  const request = vi.fn<typeof fetch>(), saved = storage()
  saved.setItem = () => { throw new Error('quota') }
  const service = createBackendOrderService(request), attempt = createBackendOrderAttempt(input)
  await expect(createBackendOrderCoordinator(saved, service, lock).send(attempt)).rejects.toThrow('quota')
  await expect(createBackendOrderCoordinator(storage(), service, () => Promise.reject(new Error('lock'))).send(attempt)).rejects.toThrow('lock')
  expect(request).not.toHaveBeenCalled()
})
it('recovers without sending again and verifies the original total before clearing', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved, attempt)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ ...receipt, total_cents: 241 })))
    .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
  const coordinator = createBackendOrderCoordinator(saved, createBackendOrderService(request), lock)
  await expect(coordinator.recover(attempt)).rejects.toThrow()
  expect(readBackendOrderAttempt(saved)).toEqual(attempt)
  await expect(coordinator.recover(attempt)).resolves.toEqual(receipt)
  expect(readBackendOrderAttempt(saved)).toBeNull()
  expect(request.mock.calls.every(([url]) => String(url).endsWith('/recover'))).toBe(true)
})
it('reposts only after an explicit not-found result using the original key and body', async () => {
  const saved = storage(), attempt = createBackendOrderAttempt(input)
  saveBackendOrderAttempt(saved, attempt)
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'WEB_ORDER_NOT_FOUND' }), { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
  await expect(createBackendOrderCoordinator(saved, createBackendOrderService(request), lock).recover(attempt)).resolves.toEqual(receipt)
  expect(request.mock.calls[1][1]?.body).toBe(attempt.body)
  expect(request.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': attempt.key })
})
