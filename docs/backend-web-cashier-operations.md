# Consumidor Web: devoluciones y cortes

## Estado vigente de integración (2026-10-01)

CashierOperations ya conecta preview/corte/devolución a Backend API. Persiste el intento original, bloquea otros cuerpos pendientes y permite recuperar la operación. La confirmación validada se presenta antes de retirar su registro local.

Validación de esta sesión: Web 451 pruebas correctas, build/lint correctos;
backend Docker 23 pruebas SQL/HTTP correctas. No hubo prueba visual completa
en navegador, pruebas de dispositivo ni importación real.

## Evidencia anterior

Las referencias siguientes a integración pendiente y uso de Supabase describen
el estado anterior; quedan sustituidas por el estado vigente de arriba.

Este bloque prepara `src/features/cashier/backend-cashier-operations-service.ts` para los endpoints oficiales existentes. No cambia la pantalla de Caja ni su proveedor de sesión: siguen usando Supabase. No se creó otra API, proveedor ni ruta de UI.

## Contrato

- `refundPreview`: consulta importe original y disponibilidad de reposición.
- `submit` con intento `refund`: devolución completa con motivo, método, reposición explícita y confirmación `money_returned: true`. El importe lo decide el servidor.
- `closingPreview`: operaciones pendientes del cajero y último corte.
- `submit` con intento `closing`: apertura y efectivo contado en centavos enteros.
- `closingDetail` y `recoverClosing`: detalle y recuperación mediante la clave original.
- Cada petición comprueba primero `/api/v1/auth/me`, usuario esperado y sucursal activa. Los permisos y la transacción siguen siendo autoridad del backend.
- Los recibos validan identidad, IDs, importes seguros y fechas. El corte comprueba sus ecuaciones con BigInt y admite efectivo esperado negativo. Sus listas de pagos/devoluciones deben ser únicas y ordenadas.

## Uso e integración pendiente

Crear un intento con `createBackendCashierOperationAttempt`. Contiene usuario, sucursal, tipo, venta cuando aplica, cuerpo JSON inmutable y clave aleatoria de 256 bits. Llamar `submit(token, intento, localStorage)`: el servicio guarda y relee el intento antes de cualquier petición, bajo un Web Lock compartido por usuario y sucursal. Una devolución y un corte comparten ese ámbito para no desplazar un pendiente. Si el navegador no dispone de Web Locks o falla el almacenamiento, no envía la operación. No almacena tokens. La conexión de la pantalla con la sesión Backend API sigue pendiente.

Ante `resultUncertain`, conservar el intento; no generar otra clave ni repetir automáticamente. Para cortes, consultar `recoverClosing`. Las devoluciones no tienen endpoint de recuperación separado: reenviar explícitamente el mismo intento devuelve el recibo idempotente y puede crear la devolución si el primer envío no llegó al servidor. Esto debe explicarse al operador. Consultar `readBackendCashierOperationAttempt(localStorage, identidad)` al restaurar la sesión. Tras validar y presentar el recibo, llamar `finishBackendCashierOperationAttempt(localStorage, intento)`: solo elimina el intento coincidente y usa el mismo Web Lock. Los datos corruptos bloquean el envío y no se borran ni reemplazan automáticamente. Un error definitivo también conserva el intento: su resolución explícita corresponde a la futura pantalla; no se descarta automáticamente.

La integración deberá introducir estos consumidores junto con la sesión Backend API, restauración/presentación de pendientes y pruebas de pantalla. Nunca enviar un token Supabase a estos endpoints ni mezclar IDs UUID con IDs MariaDB.

## Validación previa del consumidor y persistencia

- `npm run lint`: correcto.
- `npm run build`: correcto.
- `npm test`: 423 pruebas, 33 archivos, correctas; 16 pruebas de este consumidor (7 añadidas para persistencia y concurrencia en este bloque).
- En los bloques iniciales no se ejecutó Docker/UI. La validación local posterior se describe debajo.
- Sin cambios de esquema, lógica de producción del backend, Android, datos reales o despliegue.

## Prueba del consumidor contra Docker (2026-10-01)

Se añadió `scripts/verify-backend-cashier-operations.mjs` y el auxiliar local `ViveroApp/backend/test/web-cashier-operations-fixture.js`. La prueba crea una sucursal, usuario MANAGER, sesión, venta pagada y pago sintéticos exclusivos. La sesión se crea como fixture: esta prueba no verifica el formulario de login ni la contraseña. Los tokens se mantienen en memoria y no se imprimen.

El consumidor real de TypeScript se carga con Vite y llama por HTTP al proxy del mismo origen (`localhost:5173`), a la API local y a MariaDB. Comprueba:

- Importe devuelto de 900 centavos, separado del efectivo recibido (1000) y cambio (100).
- Respuesta perdida después de confirmar la devolución; el intento retenido se restaura y el reenvío devuelve el mismo registro idempotente.
- Bloqueo de un corte mientras hay una devolución pendiente.
- Corte con apertura 100 y efectivo contado 90: esperado 100, diferencia -10.
- Detalle, recuperación y reenvío del mismo corte, con los mismos IDs de pago y devolución.
- Consulta directa de MariaDB: exactamente una devolución y un corte, importes y asociaciones correctos.
- Bandeja de operaciones pendientes vacía después del corte y eliminación explícita del intento reconocido.
- Limpieza únicamente de las filas sintéticas creadas por el auxiliar.

Resultado: correcto en `vivero-fresh-20261001c`, API en puerto 33002. El entorno se detuvo al terminar, preservando sus volúmenes. No hubo cambios en producción ni en otros entornos Docker.

Esta prueba usa un adaptador de almacenamiento en memoria conservado entre instancias y un bloqueo serial inyectado. Verifica los contratos de persistencia/recuperación y HTTP, pero no demuestra localStorage ni Web Locks nativos entre pestañas, recarga de página o el comportamiento visual de Caja. Esas pruebas corresponden a la integración posterior de la pantalla. Tampoco verifica reposición de existencias: la devolución usa `restock: false`.

Para repetir, iniciar primero una instalación local aislada ya migrada, con `WEB_ORIGIN=http://localhost:5173`, API publicada en loopback y el puerto 5173 libre. No apuntar a datos reales. Desde ViveroWeb:

```powershell
node scripts/verify-backend-cashier-operations.mjs C:/Users/GAMER/AndroidStudioProjects/ViveroApp C:/Users/GAMER/AndroidStudioProjects/ViveroApp/tmp/browser-validation-20261001.env vivero-fresh-20261001c 33002
```

El archivo env del ejemplo es local, ignorado y no viene en un clon. Configurarlo según las plantillas de ViveroApp; el script requiere raíz del repositorio App, archivo env, nombre explícito `vivero-fresh-*` y puerto. No instala dependencias, no inicia ni detiene Compose automáticamente. Si falla el auxiliar, el runner informa la fase y omite su salida para no exponer tokens. Revisar la instalación local y la limpieza antes de repetir; no borrar volúmenes como solución.

Validación nueva de este bloque: prueba HTTP/SQL anterior, `npm run lint` y `node --check` de ambos scripts. Las 423 pruebas y compilación referidas arriba son evidencia del bloque anterior; no se repitieron porque no cambió código de producción.

## Dependencias para activar la pantalla: historial y folio (2026-10-01)

Se completaron los contratos y consumidores de historial de pagos y búsqueda exacta de devoluciones por folio. `backend-cashier-service.ts` ofrece `receipts` y `receipt` (lecturas sin clave de cobro), y `backend-cashier-operations-service.ts` ofrece `refundLookup`. El historial es exclusivo del cajero y su sucursal; el recibo conserva la devolución por separado y no recalcula precios con catálogo vigente. Las líneas históricas sin código/precio de lista mantienen null, sin reemplazarlo por datos actuales.

El runner documentado arriba ahora comprueba historial, comprobante antes/después de devolución y folio, con un producto/categoría/línea sintéticos adicionales que también limpia. Pasó contra Docker local. Nueva suite Web: 427 pruebas correctas, lint/build correctos. No cambió AuthProvider ni la pantalla; se resolvieron dependencias necesarias para conectarlos. Contrato completo y verificaciones backend: `ViveroApp/docs/backend-cashier-receipts.md`.
