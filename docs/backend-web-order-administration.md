# Atención de pedidos Web: consumidor Backend API

## Estado vigente de integración (2026-10-01)

AdminOrders ya utiliza Backend API para listar pedidos, cambiar estado con la revisión mostrada y enviarlos a Caja MariaDB. La proyección view=operations devuelve sucursal, venta vinculada, número de pedido y reloj reales. Un error exige actualizar antes de otra acción.

Validación de esta sesión: Web 451 pruebas correctas, build/lint correctos;
backend Docker 23 pruebas SQL/HTTP correctas. No hubo prueba visual completa
en navegador, pruebas de dispositivo ni importación real.

## Evidencia anterior

Las referencias siguientes a integración pendiente y uso de Supabase describen
el estado anterior; quedan sustituidas por el estado vigente de arriba.

Servicio implementado y verificado el 2026-10-01 en
`src/features/public-orders/backend-admin-order-service.ts`. Consume contratos
autoritativos existentes de ViveroApp, sin cambiar SQL, backend o Android.

`createBackendAdminOrderService()` ofrece métodos con token API explícito:

- `list(token, query?, signal?)`: bandeja con limit (50 predeterminado, máximo 100),
  beforeId, branchId y status; orden por ID descendente y next_before_id.
- `detail(token, id, signal?)`: pedido, partidas e historial.
- `update(token, id, { status, expected_revision, observation }, signal?)`:
  cambio de estado con revisión observada; PENDING no es destino válido.
- `sendToCashier(token, id, signal?)`: cuerpo vacío, venta asociada e indicador
  de repetición. El resultado puede recuperar una venta que ya cambió de estado.

Solicitudes al proxy del mismo origen `/api/v1/admin/web-orders`, bearer opaco,
sin cookies, caché, redirecciones, almacenamiento de sesión o reintentos automáticos.
Acepta AbortSignal y timeout de diez segundos. No cambia motor ante fallos.

El parser conserva IDs enteros, valida campos/versiones, fechas UTC, centavos
seguros y suma de partidas usando BigInt, cantidades, descuentos y promociones
fotografiadas al aceptar el pedido. Comprueba pertenencia del detalle y respuestas
de escritura al pedido solicitado, paginación descendente sin duplicados, filtros
explícitos y coherencia del historial con la revisión/estado actual.

Permisos y restricciones permanecen en servidor: lectura global requiere
VIEW_ALL_SALES; lectura por sucursal requiere VIEW_BRANCH_SALES y sucursal activa.
Las escrituras exigen sucursal propia activa. Envío a caja admite las capacidades
del contrato checkout. El servicio no interpreta una respuesta de lectura como
permiso para escribir, no deriva permisos del rol y no transforma el token API
en una sesión Supabase.

Errores de revisión, pago requerido, pedido ya enviado a caja, disponibilidad,
401/403 y estados inválidos se presentan con mensajes locales seguros. Una pérdida
de respuesta o error 5xx al escribir se marca resultUncertain; refrescar detalle
antes de volver a actuar. Un reintento de estado conserva revisión, estado y
observación originales: el servidor determina si fue la misma operación. El envío
a caja se recupera por pedido, sin generar otra venta desde el cliente.

## Validación de esta sesión

Desde ViveroWeb:

```powershell
npm test
npm run lint
npm run build
```

Suite completa: 388 pruebas en 30 archivos aprobadas; lint aprobado. Tras admitir
DELIVERED en el recibo de una venta previamente enviada a caja, siete pruebas
específicas y build final aprobados. No se instalaron dependencias.

Prueba real local con módulos TypeScript cargados por Vite, proxy, API y MariaDB
021: login OWNER sintético, creación de pedido, bandeja filtrada, detalle/historial,
confirmación y repetición, conflicto de revisión vieja, envío y repetición a caja
con mismo sale_id, asociación en detalle, rechazo de cancelación posterior,
rechazo de entrega sin pago y rechazo de sesión revocada. No se realizó cobro.

Se retiraron únicamente los fixtures sintéticos identificados por contacto/nombre
exactos, verificando pedido READY, venta SENT_TO_CASHIER y ausencia de pagos dentro
de transacción. Vite cerrado, Docker de prueba detenido sin borrar volúmenes;
entorno anterior continúa saludable. Scripts ignorados en tmp de ViveroApp.
No se repitieron suites Android/SQL/backend porque no cambiaron.

## Activación pendiente

El servicio aún no está importado por pantallas: la UI actual continúa en Supabase,
incluida Caja. No se declara una bandeja API operativa ni una migración de sesión
terminada. El bundle elimina estos consumidores todavía no usados.
Se mantiene un único AuthProvider y ninguna ruta o selector paralelo.

Siguiente trabajo: conectar las pantallas y sus consumidores con la sesión API,
coordinando catálogo, carrito/pedidos y atención administrativa. El cobro Web
también necesita su consumidor API antes de permitir que esas ventas se atiendan
en Caja: una venta MariaDB no aparece en la bandeja Supabase. No activar un cambio
aislado de AuthProvider que deje RPC restantes sin sesión.

Archivos propios: servicio, `backend-admin-order-service.test.ts`, esta guía y
referencias en las guías de corte/pedidos públicos. Cambios preexistentes de
configuración, proxy, README y servicios preparados se conservaron. Sin commit,
push, operación remota o despliegue; rama main.

Núcleo de cobro API preparado y probado de extremo a extremo con datos sintéticos: [backend-web-cashier-service.md](backend-web-cashier-service.md). Caja visible conserva Supabase hasta conectar todos sus consumidores necesarios.
