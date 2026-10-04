# Consumidor Web de Caja para Backend API

## Estado vigente de integración (2026-10-01)

La bandeja, detalle, reclamación, liberación, cobro y recuperación visibles de Caja ya utilizan la sesión y API oficiales. El backend expone metadatos reales con view=operations. Mostrador todavía está pendiente; las ventas Android y el historial Supabase no han sido importados.

Validación de esta sesión: Web 451 pruebas correctas, build/lint correctos;
backend Docker 23 pruebas SQL/HTTP correctas. No hubo prueba visual completa
en navegador, pruebas de dispositivo ni importación real.

## Evidencia anterior

Las referencias siguientes a integración pendiente y uso de Supabase describen
el estado anterior; quedan sustituidas por el estado vigente de arriba.

Implementado y validado el 2026-10-01 en
`src/features/cashier/backend-cashier-service.ts`. Consume los contratos existentes
de ViveroApp/cashier.js y migraciones 013–017. Sin SQL nuevo, dependencias, selector
de motor, provider o ruta de aplicación adicional.

## Contrato

`createBackendCashierService()` recibe token API explícito en cada método:

- list: pendientes de sucursal propia, límite 50 (máximo 100), cursor beforeId.
- detail: venta y partidas; valida IDs, importes y cantidades DECIMAL conservadas
  como strings de hasta tres decimales. Comprueba partidas con BigInt, sin redondear.
- claim: adquiere reserva con null o renueva con claim_token existente.
- release: libera exclusivamente con el token de reserva devuelto.
- pay: confirma un intento inmutable con clave de idempotencia propia.
- recover: recupera por venta y la misma clave, vinculada en servidor al cajero.

Solicitudes a `/api/v1/cashier/sales`, proxy del mismo origen, bearer opaco, sin
cookies, caché o redirecciones. Cancelación y timeout de diez segundos; no reintentos
automáticos, clave nueva durante recuperación ni fallback a Supabase.

`createBackendPaymentAttempt(saleId, cashierId, branchId, input)` captura el cuerpo
independiente del formulario y genera clave criptográfica de 32 bytes. El cuerpo
incluye claim_token, method CASH/CARD/TRANSFER, amount_received_cents y reference.
Validación de referencias sensibles y autorización siguen en servidor.

Recibos se validan contra venta, cajero y sucursal esperados, estado PAID, importes
enteros seguros, cambio exacto, método, recibido solicitado y referencia del intento.
No acepta hashes/claves internas del backend en respuestas. El servidor decide
cuánto se debe cobrar, el cambio, disponibilidad de stock y confirmación transaccional.

Las funciones save/read/clearBackendPaymentAttempt reciben Storage explícito y
usan `viveroweb_backend_payment_attempt_v1` con versión y autoridad backend-api.
La restauración exige el mismo cajero y sucursal. Corrupción, identidad distinta
o fallo de almacenamiento no borran/reemplazan el intento ni generan otra clave.
La futura pantalla deberá guardar correctamente antes del POST y detener el envío
si falla. Son funciones preparadas; no hay persistencia automática ni cambios al
almacenamiento actual de Caja Supabase. Contienen clave/reserva/referencia: evitar
URLs, logs y analítica y elegir su ciclo de vida al integrar la pantalla.

Pérdidas de conexión, abortos, errores 5xx o recibos incompatibles al pagar se marcan
resultUncertain. Conservar intento y recuperar con el mismo cajero; un 404 de
recuperación no demuestra que una operación todavía en curso nunca se confirmará.
No reenviar con otra clave ni liberar automáticamente la reserva ante incertidumbre.
Los mensajes de reserva, sesión, permisos, efectivo insuficiente y conflicto son
locales y seguros. La UI no sustituye OPERATE_CASHIER y la sucursal activa del servidor.

## Pruebas de esta entrega

Desde ViveroWeb:

```powershell
npm test
npm run lint
npm run build
```

398 pruebas en 31 archivos aprobadas, incluidas diez del nuevo consumidor; lint y
TypeScript/bundle aprobados. Cubren contratos de los tres métodos de pago, importes,
identidades, persistencia, cantidades fraccionarias, reserva/renovación/liberación,
respuestas incompatibles e incertidumbre. No se instalaron dependencias.

Prueba real con módulos TypeScript cargados por Vite, proxy, API y MariaDB/021:
OWNER demo crea pedido y lo confirma; envío a caja; bandeja y detalle; reserva,
renovación, liberación y nueva reserva; captura/restauración del intento; cobro CASH
con cambio de 100 centavos; repetición y recuperación del mismo payment_id; venta
retirada de pendientes; pedido READY y COMPLETED tras pago. No hubo dinero real
ni proveedor de pagos. CARD y TRANSFER se comprobaron aquí por contrato unitario;
no se presenta como una prueba SQL nueva de esos métodos.

Antes del cobro se confirmó por SQL que DEMO tenía inventory_enabled=0. Fixtures
de contacto/nombre exactos retirados dentro de transacción tras comprobar pedido
COMPLETED, venta PAID y un solo pago CASH sin referencia. Se eliminaron únicamente
esos fixtures de prueba. Vite cerrado, Docker de prueba detenido, volúmenes
conservados y entorno previo saludable. Scripts/configuración ignorados en tmp
de ViveroApp, sin secretos mostrados. No se repitieron suites Android/backend/SQL
porque sus fuentes no cambiaron.

## Estado y siguiente integración

El servicio aún no se importa en pantallas. La Caja y la sesión visibles continúan
en Supabase, y el bundle elimina el código nuevo sin uso. No se declara un módulo
operativo migrado. Sesión API, catálogo, pedidos, atención y núcleo de cobro ya tienen
consumidores probados, pero su conexión a hooks, pantallas y ciclo de vida es trabajo
pendiente. También quedan los consumidores complementarios de Caja (venta de
mostrador, historial, devoluciones/cortes según sus contratos) y demás módulos
antes de sustituir globalmente AuthProvider. No habilitar esos consumidores con
token API mientras aún invoquen RPC Supabase.

Archivos propios: servicio, backend-cashier-service.test.ts, esta guía y enlace
en backend-web-order-administration.md; referencia de estado en el mapa autoritativo
de ViveroApp. Cambios anteriores de configuración, proxy, README y servicios
preparados se preservaron. Sin commit, push, operación remota ni despliegue; main.

Cotización autenticada y envío/recuperación de venta de mostrador preparados: [backend-web-counter-sales.md](backend-web-counter-sales.md). El compositor y el escaneo visibles siguen en Supabase.
