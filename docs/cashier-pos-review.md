# Caja POS — revisión local

Implementado únicamente en ViveroWeb sobre `main`, HEAD inicial
`f208ffb1dabf8db5d740a5c17cab7a09d33236d6`. Pendiente de aprobación visual;
no se publicó esta versión.

## Resultado

- Cobrar pendientes: lista compacta con búsqueda, origen, folio e importe;
  consultar el detalle no reserva la venta. El botón Cobrar venta conserva
  el flujo de reserva existente.
- Venta directa: búsqueda por nombre/código, categorías del catálogo existente,
  fotografía cuando la API la proporciona, cantidades, subtotales y ticket.
  En computadora y tablets el ticket permanece al lado de los productos;
  la lista de líneas puede desplazarse sin alargar el total.
- Efectivo, tarjeta y transferencia conservan confirmaciones y validaciones.
  Pago registrado conserva el comprobante canónico y la impresión explícita.
- Historial, devoluciones y cierre conservan sus componentes y accesos discretos.
  Los avisos de recuperación permanecen visibles y bloquean operaciones nuevas.
- Corregido el encabezado del comprobante que heredaba posición fija de la
  navegación y tapaba Caja. El ajuste está limitado a `@media screen`.

Se reutilizaron CashierPage, PendingList, SaleSummary, PaymentPanel,
CounterSaleComposer, coordinadores, diario persistido, cancelación, historial,
operaciones y comprobantes existentes. No cambiaron API, SQL, Android,
autenticación, permisos, reservas, pagos, inventario ni recuperación.
El servicio de lectura únicamente expone fotografía/precio ya validados y
transmite el filtro existente de categoría; agregar vuelve a consultar el
producto y confirmar mantiene la cotización autoritativa.

## Archivos de esta tarea

Todos bajo `src/features/cashier/`, excepto este informe:

- `CashierPage.tsx`: navegación y distribución POS.
- `CashierPendingList.tsx`: modo compacto seleccionable, sin cobro en la fila.
- `CashierSaleSummary.tsx`: folio y detalle confirmado.
- `CashierPaymentPanel.tsx`: título Pago registrado.
- `CounterSaleComposer.tsx`: presentación de productos, categorías y ticket.
- `cashier-pos.css`: estilos acotados a Caja y pantalla.
- `counter-sale.ts`: fotografía opcional del producto.
- `counter-sale-service.ts`: lectura de fotografías, precios y categorías existentes.
- `cashier-desk.test.tsx`: selección compacta y bloqueos.
- `counter-sale-service.test.ts`: consultas de catálogo sin escritura.
- `docs/cashier-pos-review.md`: este informe.

## Validaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Vitest: 8 archivos de Caja afectados | 88 pruebas aprobadas |
| TypeScript + Vite: `npm run build` | Aprobado |
| ESLint: `npm run lint` | Aprobado |
| Edge real, interfaz React con API interceptada sintética | 64 comprobaciones aprobadas |
| Capturas completas | 17, sin desbordamiento horizontal |
| Tamaño de botones del POS en escenarios capturados | Altura mínima 48 px comprobada |

Vitest ejecutado para: `cashier-desk.test.tsx`, `cashier-payment.test.ts`,
`cashier-cancellation.test.tsx`, `cashier-receipts.test.ts`,
`counter-sale.test.ts`, `counter-sale-service.test.ts`,
`backend-counter-sale-service.test.ts`, `cashier-ticket.test.tsx`.

El navegador verificó búsqueda por folio, selección mediante teclado sin
reservar, apertura de cobro, cambio de métodos, confirmación y éxito,
dos solicitudes de impresión sin otro pago, cotización/registro/apertura
de venta directa conservando cantidades, cancelación elegible, permisos,
reserva de otro cajero y recuperación de un pago tras pérdida de respuesta,
recarga y nuevo inicio de sesión sin repetir el POST de pago.

La evidencia está en `artifacts/pos-review/` (ignorado por Git):
`browser.cjs`, `browser-results.json`, `browser.log`, `unit.log`,
`build.log`, `lint.log`, `baseline.json` y las capturas. El navegador usó
únicamente `http://127.0.0.1:33110`; todas las rutas API fueron interceptadas
y los destinos externos bloqueados. Los productos, cuentas, pagos y ventas
son sintéticos; las fotografías proceden de los recursos existentes.

## Capturas reales

[Galería completa](../artifacts/pos-review/gallery.html).

| Pantalla | Computadora 1440 × 1000 | Tablet horizontal 1024 × 768 | Tablet vertical 768 × 1024 |
| --- | --- | --- | --- |
| Pendientes | [Ver](../artifacts/pos-review/desktop-pendientes.png) | [Ver](../artifacts/pos-review/tablet-horizontal-pendientes.png) | [Ver](../artifacts/pos-review/tablet-vertical-pendientes.png) |
| Seleccionada | [Ver](../artifacts/pos-review/desktop-seleccionada.png) | [Ver](../artifacts/pos-review/tablet-horizontal-seleccionada.png) | [Ver](../artifacts/pos-review/tablet-vertical-seleccionada.png) |
| Cobro | [Ver](../artifacts/pos-review/desktop-cobro.png) | [Ver](../artifacts/pos-review/tablet-horizontal-cobro.png) | [Ver](../artifacts/pos-review/tablet-vertical-cobro.png) |
| Venta directa | [Ver](../artifacts/pos-review/desktop-venta-directa.png) | [Ver](../artifacts/pos-review/tablet-horizontal-venta-directa.png) | [Ver](../artifacts/pos-review/tablet-vertical-venta-directa.png) |
| Pago registrado | [Ver](../artifacts/pos-review/desktop-confirmacion.png) | [Ver](../artifacts/pos-review/tablet-horizontal-confirmacion.png) | [Ver](../artifacts/pos-review/tablet-vertical-confirmacion.png) |

Adicionales: [resultado incierto](../artifacts/pos-review/desktop-resultado-incierto.png)
y [reserva de otro cajero, pantalla pequeña](../artifacts/pos-review/phone-reserva-otro-cajero.png).

## Límites y revisión pendiente

- Venta directa utiliza el circuito existente: carrito → cotización →
  confirmación de venta → reserva → cobro. No existe en esta entrega un nuevo
  contrato de cobro inmediato desde el carrito ni se anticipa el folio.
- Estas pruebas de navegador verifican la interfaz y sus solicitudes contra
  contratos sintéticos; no prueban concurrencia real de MariaDB ni ventas
  persistidas. No se repitieron suites integrales de backend al no cambiarlo.
- La impresión física, lector QR físico, teclado virtual de una tablet real
  y aceptación por los cajeros quedan pendientes. La impresión del navegador
  se sustituyó por un contador; no se abrió una impresora ni se imprimió papel.
- No se ejecutó una auditoría exhaustiva de lectores de pantalla/contraste.
  Se comprobaron teclado, etiquetas existentes, tamaños y distribución.
- Las dos imágenes mencionadas no venían en el adjunto disponible. Se utilizó
  la maqueta aprobada de seis pantallas y los criterios escritos del pedido.
- Web estaba limpio al iniciar. Los tres caminos preexistentes modificados
  en ViveroApp se conservaron y se compararon con la huella inicial.

No hubo commit, push, migraciones, despliegue, cambios de producción ni
acciones sobre Catering Oculto. La siguiente acción es revisar las capturas
y aprobar o ajustar la presentación antes de autorizar publicación.
