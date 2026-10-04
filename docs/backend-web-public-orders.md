# Contrato Web de pedidos públicos para la API

Implementado y verificado el 2026-10-01 en
`src/features/public-orders/backend-order-service.ts`. Sigue la autoridad existente
de ViveroApp: `backend/src/web-orders.js` y migraciones 009–014. No cambia SQL,
crea rutas de aplicación, añade dependencias ni introduce selector de backend.

## Contrato disponible

- `options(signal?)`: GET `/api/v1/web-orders/options`, sucursales con IDs enteros.
- `quote(input, signal?)`: POST `/quote`, sucursal y partidas con ID entero y
  cantidades enteras de 1 a 100, máximo 25 productos distintos.
- `submit(attempt, signal?)`: POST `/api/v1/web-orders`, cabecera Idempotency-Key.
- `recover(key, signal?)`: POST `/recover` con cuerpo vacío y la misma cabecera.

Valida versión, campos exactos, sucursal y partidas de la cotización, cantidades,
centavos seguros y coherencia de totales usando BigInt. No sustituye el cálculo
del servidor. El envío incluye `expected_total_cents`; un cambio real de precio
exige nueva cotización y confirmación. Recibos conservan ID entero, folio VW-ID,
estado del contrato, fecha UTC válida y señal de repetición. El total del recibo
de envío debe coincidir con el intento.

`createBackendOrderAttempt(input)` genera una clave criptográfica de 32 bytes en
hexadecimal y captura un cuerpo JSON independiente del carrito, inmutable.
Nunca genera otra clave durante submit o recover. Solicitudes al mismo origen,
sin cookies, caché ni redirecciones, con cancelación y timeout de diez segundos.
No hay reintentos automáticos ni fallback a Supabase.

`BackendOrderError.resultUncertain` identifica pérdidas de conexión, abortos o
respuestas incompatibles después de intentar escribir. También trata errores 5xx
de envío como inciertos. No se debe vaciar el carrito o crear otra clave por esos
errores. Mensajes de conflicto de precio, disponibilidad, límite e idempotencia
son locales y no muestran errores internos del servidor.

## Conservación del intento y futura integración

Las funciones save/read/clearBackendOrderAttempt reciben Storage explícitamente;
no acceden a almacenamiento al importar el módulo. Usan
`viveroweb_backend_order_attempt_v1`, versión 1 y autoridad `backend-api`.
La lectura valida contenido y clave; rechaza corrupción o autoridad ajena sin
borrar el registro. No lee ni modifica `viveroweb_public_cart_v1` de Supabase.

La futura pantalla deberá guardar correctamente el intento antes del primer
POST; si falla el almacenamiento, detener el envío. Al recargar, recuperar con
la misma clave y conservar el cuerpo original para un reintento explícito.
Un 404 de recuperación no prueba que un envío concurrente o incierto nunca se
confirmará: conservar el intento, y repetir únicamente el mismo cuerpo/clave.
Después de un recibo válido, mostrar confirmación antes de limpiar el intento.
La clave concede acceso al recibo y el cuerpo contiene contacto: no incluirlos
en URLs, logs ni analítica. La elección y ciclo de vida del almacenamiento
pertenecen a la próxima integración de pantalla; no hay persistencia automática.

Carritos antiguos con UUID se conservarán separados durante el corte; no se
convierten automáticamente a enteros ni se borran. El servicio nuevo no adapta
la UI actual ni altera PublicCartProvider. No hay otro provider de carrito.

## Evidencia de esta sesión

```powershell
npm test
npm run lint
npm run build
```

381 pruebas en 29 archivos aprobadas, incluidas nueve del contrato nuevo; lint y
TypeScript/bundle aprobados. El módulo TypeScript real, cargado por Vite y usado
mediante su proxy contra Docker local con MariaDB/021, verificó sucursales,
cotización, captura/restauración del intento, envío, repetición y recuperación
del mismo ID, y rechazo de total cambiado. Se repitió tras completar la comprobación
del total del recibo. No acredita navegación UI ni atención/cobro de ese pedido.

Fixtures exclusivamente sintéticos. Se eliminaron solo los pedidos de este caso,
con contacto/nombre exactos y estado PENDING comprobado dentro de transacción.
Vite cerrado, Docker de prueba detenido, volúmenes conservados y entorno previo
saludable. Scripts temporales ignorados en ViveroApp, sin secretos mostrados.
Sin cambios backend/Android/SQL; no se repitieron sus suites porque no cambiaron.

Archivos propios: servicio, `backend-order-service.test.ts`, esta guía y enlaces
en backend-catalog-cutover.md y backend-web-catalog-service.md. Cambios preexistentes
de configuración, README, proxy, sesión y catálogo API se preservaron. Sin commit,
push, despliegue ni operación remota.

## Estado real

Código preparado y probado; todavía no importado por la UI. Sesión, catálogo,
carrito, pedidos y administración visibles continúan en Supabase. Este código
todavía se elimina del bundle por no utilizarse. La activación del recorrido
público exige una atención administrativa con sesión API: pedidos MariaDB no
aparecen en la bandeja Supabase. Siguiente incremento: consumidor administrativo
de pedidos API y conexión coordinada del recorrido público/atención, conforme al
plan de corte. No se declara una migración operativa completada.

Consumidor administrativo de pedidos API preparado y probado: [backend-web-order-administration.md](backend-web-order-administration.md). La UI y Caja continúan en Supabase hasta su integración coordinada.
