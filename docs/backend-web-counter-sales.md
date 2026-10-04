# Venta de mostrador: contrato Web preparado para la API

Implementado y probado el 2026-10-01. Servicio en
`src/features/cashier/backend-counter-sale-service.ts`; no modifica todavía
CounterSaleComposer, el proveedor de sesión ni el recorrido Supabase existente.

## Cotización autenticada

La API oficial añade POST `/api/v1/sales/quote` con cuerpo exacto `{ items }`.
Requiere CREATE_SALES y sucursal propia activa; la sucursal se toma de la sesión,
no del cuerpo. Reutiliza precios/promociones autoritativos de quoteOrderProducts,
en transacción READ COMMITTED. No escribe ventas ni movimientos de stock.
GET quote devuelve 404 y cuerpos con branch_id/precios extras se rechazan.
Admite hasta 25 productos distintos, cantidades enteras de 1 a 100000, conforme
al contrato existente de ventas. No usa el límite 100 de pedidos públicos.

El resultado conserva la cotización existente (schema_version 1, branch_id,
subtotal/discount/total en centavos y snapshots de partidas). Web comparte su
parser de importes con pedidos públicos, con límite de cantidad explícito;
el límite predeterminado de pedidos públicos sigue siendo 100.

Para quote, creación y recuperación se admiten cabeceras opcionales
X-Expected-Actor-Id y X-Expected-Branch-Id. El servidor compara las presentes con
el contexto autenticado y rechaza discrepancias con 403 SALE_IDENTITY_CHANGED
antes de ejecutar la operación. No otorgan permisos ni sustituyen la sesión.
Los consumidores anteriores sin esas cabeceras mantienen su contrato.

## Servicio Web

`createBackendCounterSaleService()` ofrece quote, submit y recover:

- Quote envía solo partidas y comprueba la sucursal esperada del resultado.
- createBackendCounterAttempt captura cuerpo inmutable, usuario/sucursal y clave
  criptográfica de 32 bytes; el envío incluye expected_total_cents.
- Submit conserva el intento antes de POST `/api/v1/sales` dentro de un Web Lock
  que abarca lectura de pendiente, escritura y solicitud. Un intento pendiente
  distinto se rechaza sin sobrescribirlo. Sin soporte navigator.locks, no envía.
- Recover usa POST `/api/v1/sales/recover`, cuerpo vacío y la misma clave. Ambos
  envían usuario y sucursal esperados para impedir escribir con una identidad nueva.
- finishBackendCounterAttempt solo retira el pendiente si coinciden clave y cuerpo;
  el cliente lo llama después de presentar el recibo confirmado.

Almacenamiento explícito por usuario/sucursal, versión 1 y autoridad backend-api;
no lee ni borra el pendiente UUID de Supabase. Si falla almacenamiento, no se envía.
No se limpia automáticamente ante una pérdida de conexión, rechazo o respuesta
incompatible. Recuperación 404 no autoriza crear otra clave ante incertidumbre.
Antes de preparar una venta distinta, resolver explícitamente el intento previo.

El recibo valida ID entero, actor, sucursal, folio, fecha UTC y total esperado.
Conserva el contrato de ventas: subtotal es el importe con precios efectivos y
discount_cents es cero; la cotización sí informa la rebaja frente a precio de lista.
No recalcula precios ni genera folios en navegador. Red sin cookies, caché,
redirecciones o fallback; timeout de quince segundos y cancelación. Errores de
escritura inciertos conservan el intento. No se registran claves ni cuerpos.

## Validación real de esta sesión

Web: `npm test` (405 pruebas, incluidas siete nuevas), `npm run lint` y
`npm run build`, aprobados. Backend en Docker local: `npm test`, `npm run check`
y `npm run test:integration` aprobados; 22 integraciones. La integración de ventas
se amplió para quote, permisos, cantidades mayores que 100, rechazo de cuerpo
con sucursal, método GET y actor esperado incorrecto; la venta posterior conserva
su conteo, verificando que la cotización no creó otras ventas.

Prueba adicional con servicio TypeScript cargado por Vite, proxy, API y MariaDB
021: login demo, cotización, envío, almacenamiento/restauración, repetición y
recuperación del mismo ID, precio cambiado e identidad distinta rechazada antes
de escribir. En Node se suministraron almacenamiento y exclusión de prueba; no
acredita Web Locks nativos en un navegador ni navegación UI. La exclusión de dos
intentos se probó unitariamente. No se realizó un cobro nuevo en este bloque.

Fixture sintético retirado dentro de transacción por ID/folio/usuario/sucursal
exactos, estado SENT_TO_CASHIER, sin pedido asociado y ausencia de pagos. Scripts
y metadatos de fixture quedan en tmp ignorado de ViveroApp. Vite cerrado y Docker
de prueba detenido conservando volúmenes; entorno anterior saludable.
Sin cambios SQL: no se repitieron inicialización de base o pgTAP. Android sin
cambios y sin build en esta sesión. Sin datos reales, commit, push o despliegue.

## Archivos y pendientes

ViveroWeb: servicio, backend-counter-sale-service.test.ts, parser compartido
backend-order-service.ts, esta guía y referencia desde backend-web-cashier-service.md.
ViveroApp: backend/src/sales.js, backend/src/app.js,
backend/test/sales-integration.test.js y referencias de arquitectura/mapa de migración.
Cambios previos preservados en ambos repositorios main.

Servicio todavía no importado por UI: venta de mostrador, sesión y Caja visibles
siguen en Supabase. Escaneo de código, cliente asociado, historial/pantallas y
consumidores complementarios no se declaran migrados. El catálogo API existente
sirve para selección/búsqueda por nombre, pero no equivale al RPC de escaneo.
Siguiente trabajo: completar esos contratos necesarios para Caja y conectar
coordinadamente la sesión/pantallas, preservando los pendientes de ambos motores.

Escaneo por código API ya preparado y probado: [backend-web-product-scan.md](backend-web-product-scan.md). Esta actualización reemplaza el pendiente de contrato de escaneo de la sección anterior; su pantalla aún conserva Supabase.
