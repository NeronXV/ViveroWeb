# Caja Web — etapa 5, validación local

Fecha: 2026-10-09. Alcance autorizado: simplificación de Caja Web. No hay despliegue, commit ni push. Android y ViveroAppCliente quedan fuera.

## Resultado

Se reutilizan los servicios, coordinadores, diario persistido, permisos y componentes de comprobantes existentes. Pendientes, detalle y cobro tienen una tarea principal clara. La lista muestra folio, origen confirmado, total y estado comprensible. «Cobrar venta» abre la reserva existente; «Ver detalle» no reserva. La cancelación de etapa 4 continúa como acción secundaria, habilitada exclusivamente por el backend.

El formulario presenta efectivo y cambio, tarjeta con referencia opcional o transferencia con referencia obligatoria. Exige confirmar que se recibió el pago y vuelve a pedir esa confirmación cuando cambian sus datos. Después del éxito muestra el comprobante original y «Imprimir ticket». Comprobantes, devoluciones y cierre están agrupados. Las advertencias de almacenamiento y operaciones inciertas permanecen visibles fuera de los grupos cerrados.

La presentación usa los estados internos originales. Si queda un pago incierto, no permite volver a cobrar: al reabrir la página descubre el diario del mismo usuario y ofrece «Comprobar resultado», incluso cuando la venta ya figura pagada y no admite el detalle de pendientes. Conserva datos recuperados y las restricciones del coordinador de pago. Si otro intento de ese usuario está pendiente de comprobar, bloquea la confirmación de una venta distinta y permite atender el pendiente liberando antes la reserva actual mediante el servicio existente.

## Contrato y compatibilidad

Único cambio de backend: metadato de lectura `operation.origin` (`WEB_ORDER` / `DIRECT_SALE`) en el listado cuando se envía `X-Vivero-Cashier-View: desk-v1`. Se deriva de la relación real `sales.web_order_id`, sin exponerla en el listado. Sin el encabezado, la estructura anterior permanece igual. La búsqueda reutiliza el filtro existente por folio corto o histórico y mantiene sucursal, paginación y autorización.

Web acepta respuestas anteriores sin origen; en ese caso muestra «Venta». No deduce que una venta proviene de Android. No hay migración nueva, permisos nuevos ni cambios en cobro, reservas, pagos, inventario, devoluciones, auditoría o cancelación del servidor. Las migraciones 031 y 032 y sus implementaciones pertenecen a etapas anteriores y se conservan.

## Archivos de esta etapa

En ViveroWeb, modificados:

- `src/features/cashier/CashierPage.tsx`
- `src/features/cashier/CashierOperations.tsx`
- `src/features/cashier/CashierReceiptHistory.tsx`
- `src/features/cashier/cashier-parser.ts`
- `src/features/cashier/cashier-service.ts`
- `src/features/cashier/cashier-types.ts`
- `src/features/cashier/useCashierPaymentAttempt.ts` — solo amplía el tipo de entrada a la identidad de la venta; conserva su implementación.
- `src/features/cashier/useCashierSales.ts`
- `src/lib/backend-http.ts`

Nuevos:

- `src/features/cashier/CashierPendingList.tsx`
- `src/features/cashier/CashierSaleSummary.tsx`
- `src/features/cashier/CashierPaymentPanel.tsx`
- `src/features/cashier/cashier-desk-state.ts`
- `src/features/cashier/cashier-desk.css`
- `src/features/cashier/cashier-desk.test.tsx`
- Este reporte.

En ViveroApp, modificados `backend/src/app.js`, `backend/src/cashier.js`, `backend/package.json` e `infra/docker/compose.yaml`; nuevo `backend/test/cashier-desk-integration.test.js`. Package y Compose agregan la prueba nueva al conjunto existente.

## Validación ejecutada en esta sesión

| Validación | Resultado |
| --- | --- |
| Web `npm test -- --reporter=dot` | 506 pruebas aprobadas; 1 opcional omitida. Incluye 10 pruebas nuevas de presentación, métodos, avisos críticos, formulario bloqueado, diario, origen y búsqueda. |
| Web `npm run build` | Correcto: TypeScript y Vite. |
| Web `npm run lint` | Correcto. |
| Backend `npm test` y `npm run check` | Correctos. |
| Compose aislado `run --rm tests` | 35 pruebas de integración aprobadas con MariaDB y HTTP. Incluyen exclusión entre cajeros, reserva vencida, métodos de pago, carrera cobro/cancelación, permisos, sucursales, pedidos vinculados, recuperación, devolución, cierre y existencias. |
| `git diff --check` en ambos repositorios | Correcto al cierre. |
| Protección del trabajo previo | 18 diffs App y 17 Web fuera de los archivos de etapa 5 idénticos al inicio. `app.css` y `CashierSaleCancellation.tsx` idénticos a su copia inicial. |

La prueba HTTP opcional Web exige otro entorno de ensayo (`127.0.0.1:33003`) y su fixture específico; no se debilitó esa protección. Los flujos de esta etapa se comprobaron además contra el API real del proyecto Docker aislado `vivero-cashier-stage5` y Vite local, con usuarios, sucursal, productos y operaciones ficticios. Los intentos iniciales de ejecución restringida fallaron por permisos de filesystem/Docker; las repeticiones autorizadas terminaron correctamente.

Pruebas reales del navegador:

- Lista, origen de pedido web, búsqueda `VD-0002`, separación entre detalle y cobro.
- Efectivo: total $610, recibido $700, cambio $90. Intento sin confirmación detenido por el formulario; con confirmación mostró pago y comprobante correctos.
- Tarjeta: únicamente referencia opcional. Transferencia: referencia obligatoria. Los tres métodos también pasan la integración SQL existente.
- Respuesta perdida después del commit: un proxy local descartó una única respuesta del API. Caja mostró el aviso crítico, bloqueó salida/otro cobro y conservó el diario. Tras recarga e inicio de sesión recuperó el mismo ticket por «Comprobar resultado», total $610, recibido $650 y cambio $40.
- Dos usuarios: B abrió una venta; A la vio en atención y no pudo cobrarla.
- Reserva vencida: se venció únicamente la reserva sintética de B en la base aislada. El intento fue rechazado, mostró «Volver a abrir cobro» y permitió reabrirla explícitamente; después se liberó sin pago.
- Cancelación: motivo y confirmación; la venta desapareció de pendientes y se mostró el resultado.
- Devolución: verificación del ticket por folio, importe $610 y confirmaciones existentes. Una segunda devolución quedó bloqueada.
- Cierre: esperado y contado $610, diferencia $0; resumen posterior en cero.
- Reimpresión: historial recuperó los tickets originales, productos, total, efectivo, cambio y marca «REIMPRESIÓN». La solicitud de impresión encontró una limitación del diálogo nativo del navegador de automatización. No se verificó salida física ni PDF desde ese diálogo.
- Presentación de computadora 1280×900 y tablet 768×1024; navegación con teclado y confirmación nativa obligatoria. Capturas en `artifacts/cashier-stage5/` (ignoradas por Git).

Verificación SQL adicional del ensayo de navegador: exactamente un pago por cada una de las dos ventas cobradas; cero movimientos de inventario en la venta cancelada; stock final `[99, 98, 100]`, consistente con dos ventas mixtas y una devolución. La reapertura y reimpresión no crearon pagos adicionales.

No se modificaron `CashierPrintableTicket`, sus mecanismos de selección/impresión, etiquetas, comprobante público ni la hoja global de estilos. Toda la hoja nueva está dentro de `@media screen` y bajo `.cashier-desk`. La suite de regresión de comprobantes pasó; la generación opcional de PDFs del ensayo anterior no se ejecutó de nuevo. Tampoco se ejecutó compilación Android ni pruebas de Supabase: sus archivos y contratos no cambiaron en esta etapa.

## Conservación y aceptación pendiente

Ambos repositorios permanecen en `main`, con sus HEAD originales (`a58fd61` App, `5f9c485` Web), cambios previos y nuevos sin preparar ni registrar. Las copias iniciales, diffs y fixtures de ensayo se conservaron en la ruta ignorada `ViveroApp/tmp/cashier-stage5/`. No se mezclaron cambios ajenos en una entrega Git.

Pedro y Toni deben aceptar la interfaz en su computadora y tablet reales, comprobar uso táctil/teclado, legibilidad, casos cotidianos y ticket Black Pos de 58 mm. Sigue pendiente probar impresión física y guardar PDF desde el navegador de operación. Las reservas concurrentes y desconexión se comprobaron localmente, pero no equivalen a aceptación humana ni a pruebas en la red real del vivero.

Para un despliegue futuro autorizado: revisar por separado los diffs de etapas anteriores y de esta etapa, confirmar 031/032 en el destino, ejecutar los conjuntos de pruebas, probar la interfaz y perfiles de impresión, y preparar respaldo/plan de reversión. La etapa 5 no requiere otra migración. Publicar el API con el metadato y la Web como una entrega revisada; Web puede funcionar con el API anterior sin el origen visible. No aplicar estas instrucciones a producción sin autorización.

No hay un fallo local conocido que impida revisar esta etapa. Impresión física/PDF y aceptación de Pedro y Toni permanecen pendientes. El rediseño Android, configuración de correo y respaldo externo siguen fuera del alcance.

Al retomar el cierre, Vite y el proxy de ensayo ya no escuchaban en sus puertos. Docker Desktop tampoco estaba disponible (pipe del motor ausente), por lo que no se pudo confirmar `compose stop`. No se reinició el motor ni se eliminaron contenedores o volúmenes. Las validaciones exitosas anteriores de esta sesión se distinguen de esta comprobación final del entorno.
