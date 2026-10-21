// Built Web UI, local synthetic HTTP server; blocks all external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(join(process.env.BROWSER_TEST_MODULES,'package.json'));
const {chromium}=require('playwright');
const stamp='2026-10-15T12:00:00Z',supplier={id:1,code:'SYNTH',name:'Proveedor de ensayo'};
let purchase=null,confirmations=0,catalogue=false;const errors=[];
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/api/')){
   const chunks=[];for await(const c of req)chunks.push(c);
   const body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};
   if(path.endsWith('/auth/login'))return json(res,{token_type:'Bearer',access_token:'o'.repeat(43),expires_in:3600});
   if(path.endsWith('/auth/me'))return json(res,{schema_version:1,user:{id:1,email:'owner@example.invalid',full_name:'Dueño de ensayo'},access_state:'ACTIVE',role:{id:1,name:'OWNER',display_name:'Propietario'},branch:{id:1,code:'TEST',name:'Sucursal de ensayo',is_active:true},capabilities:['MANAGE_PRODUCTS','MANAGE_PRICES','MANAGE_INVENTORY','PUBLISH_CATALOGING']});
   if(path.endsWith('/categories'))return json(res,{items:[{id:1,name:'Follaje',description:'',is_active:true,created_at:stamp,updated_at:stamp}],next_after_id:null});
   if(path.endsWith('/products'))return json(res,{items:catalogue?[{id:7,internal_code:'SYNTH-7',barcode:null,common_name:'Ficus',scientific_name:null,description:'Planta sintética',category_id:1,price_cents:9900,wholesale_price_cents:null,unit:'pieza',minimum_stock:0,watering_advice:'',light_type:'',recommended_climate:'',is_active:true,created_at:stamp,updated_at:stamp}]:[],next_after_id:null});
   if(path==='/api/v1/products/7/preparation')return json(res,{schema_version:1,product_id:7,branch_id:1,commercial_state:'READY',ready:true,legacy_compatibility:false,price_confirmed:true,initial_count_confirmed:true,activated:true,reasons:[]});
   if(path.endsWith('/cataloging'))return json(res,{items:[],next_after_id:null});
   if(path.endsWith('/inventory/permissions'))return json(res,{schema_version:1,branch_id:1,permissions:{can_record_count:true,can_receive:true,can_approve_counts:true}});
   if(path.startsWith('/api/v1/reports/'))return json(res,{items:[]});
   if(path.endsWith('/inventory/dashboard'))return json(res,{schema_version:1,branch_id:1,items:[],has_more:false,next_product_id:null});
   if(path.endsWith('/inventory/count-observations'))return json(res,{schema_version:1,branch_id:1,items:[],next_after_id:null,permissions:{can_record_count:true,can_receive:true,can_approve_counts:true}});
   if(path.endsWith('/suppliers'))return json(res,{schema_version:1,items:[supplier],next_after_id:null});
   if(path==='/api/v1/supplier-purchases'){
    if(req.method==='GET')return json(res,{schema_version:1,branch_id:1,items:purchase?[purchase]:[]});
    purchase={...body,id:1,branch_id:1,supplier,revision:1,status:'DRAFT',item_count:body.items.length,unmatched_count:body.items.length,created_at:stamp,received_at:null,items:body.items.map((i,n)=>({...i,id:n+1,product_id:null,supplier_container_code:i.container_code,line_total_cents:i.quantity*i.unit_cost_cents,resolution_status:'UNMATCHED'}))};
    return json(res,{schema_version:1,purchase},201);
   }
   if(path==='/api/v1/supplier-purchases/1'){
    if(req.method==='PATCH'){
     assert.equal(body.revision,purchase.revision);purchase.revision++;
     purchase.items=purchase.items.map((i,n)=>({...i,...body.items[n],line_total_cents:body.items[n].quantity*i.unit_cost_cents,resolution_status:body.items[n].quantity===0?'IGNORED':body.items[n].product_id?'MATCHED':'UNMATCHED'}));
     purchase.unmatched_count=purchase.items.filter(i=>i.resolution_status==='UNMATCHED').length;
     purchase.expected_total_cents=purchase.items.reduce((sum,i)=>sum+i.quantity*i.unit_cost_cents,0);
    }
    return json(res,{schema_version:1,purchase});
   }
   if(path==='/api/v1/supplier-purchases/1/confirm'){
    assert.equal(body.revision,purchase.revision);confirmations++;purchase.status='RECEIVED';purchase.revision++;purchase.received_at=stamp;
    return json(res,{schema_version:1,purchase},201);
   }
   errors.push(`Unexpected API ${req.method} ${path}`);return json(res,{error:'NOT_FOUND'},404);
  }
  const file=extname(path)?resolve('dist','.'+path):resolve('dist/index.html');
  if(!file.startsWith(resolve('dist')+'\\'))return res.end();
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch(e){errors.push(String(e));json(res,{error:'FIXTURE_ERROR'},500)}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
await mkdir('artifacts/reception-weekend',{recursive:true});
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin+'/login?returnTo=/admin');
 await page.getByLabel('Correo electrónico').fill('owner@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill('Synthetic-only-123!');await page.getByRole('button',{name:/Iniciar sesión/i}).click();
 await page.locator('.admin-mobile-nav-toggle').click();await page.locator('#admin-tab-compras').click();
 await page.getByRole('button',{name:'+ Nueva Recepción / Cotización',exact:true}).click();
 await page.getByLabel('Proveedor',{exact:true}).selectOption('1');
 await page.getByText('Pegar o escribir lista',{exact:true}).click();
 await page.locator('textarea').fill('10 Ficus M6 $45.00\n5 Helecho M6 $30.00');await page.getByRole('button',{name:'Leer lista',exact:true}).click();
 await page.getByLabel('Corresponde a').nth(0).selectOption('new');
 await page.getByLabel('Cantidad recibida').nth(0).fill('8');await page.getByLabel('Cantidad recibida').nth(1).fill('0');
 await page.getByRole('checkbox',{name:/Comparé todas/}).check();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByText('Paso 3 de 3 · Confirmar',{exact:true}).waitFor();
 assert.equal(purchase.items[0].quantity,8);assert.equal(purchase.items[0].new_product.name,'Ficus');assert.equal(purchase.items[0].new_product.category_id,null);
 assert.equal(purchase.items[1].quantity,0);assert.equal(purchase.items[1].new_product,null);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile horizontal overflow');
 await page.screenshot({path:'artifacts/reception-weekend/confirm-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Registrar llegada',exact:true}).click();
 await page.getByRole('heading',{name:'Llegada registrada'}).waitFor();assert.equal(confirmations,1);assert.deepEqual(errors,[]);
 console.log('PASS: empty catalogue, text parsing, explicit new plant, partial and zero received, confirmation once.');
 await context.close();purchase=null;catalogue=true;
 const pdfContext=await browser.newContext({viewport:{width:1680,height:1000}});
 await pdfContext.route('**/*',r=>r.request().url().startsWith(origin+'/')||r.request().url().startsWith('blob:'+origin+'/')?r.continue():r.abort());
 const pdfPage=await pdfContext.newPage();pdfPage.setDefaultTimeout(15000);pdfPage.on('pageerror',e=>errors.push(String(e)));
 await pdfPage.goto(origin+'/login?returnTo=/admin');
 await pdfPage.getByLabel('Correo electrónico').fill('owner@example.invalid');await pdfPage.getByLabel('Contraseña',{exact:true}).fill('Synthetic-only-123!');await pdfPage.getByRole('button',{name:/Iniciar sesión/i}).click();
 await pdfPage.locator('#admin-tab-compras').click();await pdfPage.getByRole('button',{name:'+ Nueva Recepción / Cotización',exact:true}).click();
 await pdfPage.getByLabel('Proveedor',{exact:true}).selectOption('1');
 await pdfPage.waitForFunction(()=>!document.querySelector('input[type=file]').disabled);
 await pdfPage.locator('input[type=file]').setInputFiles({name:'ticket-sintetico.pdf',mimeType:'application/pdf',buffer:syntheticReceipt()});
 await pdfPage.getByText('Paso 2 de 3 · Revisar llegada',{exact:true}).waitFor();
 assert.equal(await pdfPage.getByLabel('Nombre del documento').nth(0).inputValue(),'FICUS');
 assert.equal(await pdfPage.getByLabel('Nombre del documento').nth(1).inputValue(),'HELECHO DEMO');
 assert.equal(await pdfPage.getByLabel('Costo unitario del documento').nth(0).inputValue(),'25.00');
 assert.equal(await pdfPage.getByLabel('Total del documento',{exact:true}).inputValue(),'165.00');
 assert.equal(await pdfPage.getByRole('button',{name:'Comprobar guardado',exact:true}).count(),0);
 assert.equal(await pdfPage.getByLabel('Corresponde a').nth(0).inputValue(),'');
 await pdfPage.getByRole('button',{name:'Ficus · SYNTH-7',exact:true}).click();
 await pdfPage.getByLabel('Corresponde a').nth(1).selectOption('new');
 await pdfPage.getByLabel('Costo unitario del documento').nth(0).fill('26.00');
 await pdfPage.getByRole('checkbox',{name:/Comparé todas/}).check();
 assert.ok(await pdfPage.getByRole('button',{name:'Continuar',exact:true}).isDisabled());assert.equal(purchase,null);
 await pdfPage.getByLabel('Costo unitario del documento').nth(0).fill('25.00');
 await pdfPage.getByLabel('Cantidad recibida').nth(0).fill('2');
 await pdfPage.waitForFunction(()=>{const c=document.querySelector('.reception-preview-scroll canvas');return c&&c.width>300});
 await pdfPage.screenshot({path:'artifacts/reception-weekend/review-desktop.png',fullPage:true});
 await pdfPage.setViewportSize({width:390,height:844});
 assert.ok(await pdfPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Review mobile horizontal overflow');
 await pdfPage.screenshot({path:'artifacts/reception-weekend/review-mobile.png',fullPage:true});
 await pdfPage.getByRole('checkbox',{name:/Comparé todas/}).check();await pdfPage.getByRole('button',{name:'Continuar',exact:true}).click();
 await pdfPage.getByText('Paso 3 de 3 · Confirmar',{exact:true}).waitFor();
 assert.equal(purchase.items[0].product_id,7);assert.equal(purchase.items[0].quantity,2);assert.equal(purchase.items[0].unit_cost_cents,2500);
 assert.equal(purchase.expected_total_cents,14000);assert.equal(purchase.items[1].new_product.name,'HELECHO DEMO');
 await pdfPage.getByRole('button',{name:'Atrás',exact:true}).click();
 assert.ok(await pdfPage.getByLabel('Costo unitario del documento').nth(0).isDisabled());
 await pdfPage.getByRole('button',{name:'Continuar',exact:true}).click();await pdfPage.getByText('Paso 3 de 3 · Confirmar',{exact:true}).waitFor();
 await pdfPage.getByRole('button',{name:'Registrar llegada',exact:true}).click();await pdfPage.getByRole('heading',{name:'Llegada registrada'}).waitFor();
 assert.equal(confirmations,2);assert.deepEqual(errors,[]);
 console.log('PASS: PDF worker and column order, wrapped names/prices, total mismatch blocked before save, suggestions require choice, partial delivery, immutable saved costs, mobile and desktop.');
}catch(e){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:'artifacts/reception-weekend/failure.png',fullPage:true})}console.error(e,errors);process.exitCode=1}
finally{await browser?.close();await new Promise(r=>server.close(r))}

function syntheticReceipt() {
 const text=(value,x,y)=>`BT /F1 8 Tf 1 0 0 1 ${x} ${y} Tm (${value.replace(/[()\\]/g,'\\$&')}) Tj ET\n`;
 const stream=text('Cant',10,340)+text('Descripcion',34,340)+text('Total',196,340)
  +text('3',18,320)+text('$75.00',186,320)+text('1001 X01 FICUS M6',34,320)+text('($ 25.00)',34,308)
  +text('2',18,290)+text('$90.00',186,290)+text('1002 X02 HELECHO',34,290)+text('DEMO B6 ($',34,278)+text('45.00)',34,266)
  +text('TOTAL:',100,240)+text('$165.00',186,240);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 227 380] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
