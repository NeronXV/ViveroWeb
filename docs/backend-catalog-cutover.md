# Preparación del catálogo con la API oficial

El plan coordinado y la matriz de contratos están en
[`ViveroApp/docs/web-catalog-cutover.md`](../../ViveroApp/docs/web-catalog-cutover.md).
Revisión local: 2026-09-30. No se activó un nuevo proveedor de catálogo ni cambió
el código Web en este bloque.

La API ya admite búsqueda y categoría sobre IDs enteros. El catálogo Web,
imágenes, carrito, pedidos, sesión y administración siguen usando sus contratos
Supabase. El cambio de catálogo debe coordinarse con pedidos y con el tratamiento
del carrito persistido: no enviar IDs MariaDB a `submit_web_order`.

Consultar el documento autoritativo para archivos afectados, diferencias de
precio/paginación, origen/proxy pendiente, criterios de aceptación y reversión.
No añadir selectores de motor ni credenciales administrativas al cliente.

## Canal Web/API comprobado (2026-10-01)

Proxy Vite y validación de origen implementados; ver [backend-browser-connection.md](backend-browser-connection.md). El bloqueo de transporte de navegador queda resuelto al configurarlo. Servicios, identidad, carrito y pedidos siguen Supabase: no se activó el cambio de consumidores.

## Consumidor de lectura preparado (2026-10-01)

Servicio Web de catálogo API validado; todavía no se activa en UI. Contrato y evidencia en [backend-web-catalog-service.md](backend-web-catalog-service.md). Catálogo y pedidos vigentes permanecen en Supabase hasta el corte coordinado.

Contrato de pedidos públicos API preparado y probado: [backend-web-public-orders.md](backend-web-public-orders.md). El carrito y la interfaz siguen en Supabase hasta su integración coordinada con atención administrativa.

Consumidor administrativo de pedidos API preparado y probado: [backend-web-order-administration.md](backend-web-order-administration.md). La UI y Caja continúan en Supabase hasta su integración coordinada.
