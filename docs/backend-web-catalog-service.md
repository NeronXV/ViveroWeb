# Consumidor Web de catálogo Backend API

Implementado y verificado el 2026-10-01. Código en
`src/features/public-catalog/backend-catalog-service.ts`, junto al catálogo existente.
Es el contrato preparado para el corte oficial; no hay selector de motor, rutas
de aplicación adicionales, nuevas dependencias ni fallback a Supabase.

`createBackendCatalogService()` ofrece:

- `products({ limit?, afterId?, search?, categoryId? }, signal?)`.
- `categories({ limit?, afterId? }, signal?)`.

Consume GET `/api/v1/products` y `/api/v1/categories` mediante el proxy del mismo
origen. La paginación usa ID entero creciente, límite predeterminado 24 y máximo
100. Rechaza filas duplicadas, fuera de orden, anteriores al cursor y cursores
incoherentes. Las categorías tienen paginación propia: la futura UI debe agotarla
si necesita todos los filtros, sin suponer que la primera página es completa.

Valida formas exactas, IDs enteros MariaDB, visibilidad activa, centavos enteros
seguros, unidades admitidas, imágenes del path exacto `/api/v1/images/:id` y
promociones coherentes con el precio efectivo. Conserva el precio del servidor
sin recalcular descuentos; admite porcentaje redondeado a cero cuando existe una
rebaja positiva mínima. La UI deberá mostrar la rebaja por importes cuando el
porcentaje redondeado no la representa. No convierte IDs a UUID ni fabrica rutas
de Storage Supabase. Imágenes, información de cuidados y promociones permanecen
en el contrato API propio.

Solicitudes sin cookies, caché ni redirecciones; cancelación combinada con timeout
de ocho segundos. Sin reintentos automáticos ni cambio de autoridad ante un error.

## Estado de activación

Servicio probado, todavía no llamado por hooks o pantallas. Catálogo, carrito,
envío de pedidos y atención administrativa existentes continúan en Supabase.
El build elimina el código nuevo todavía no utilizado. No se declara un módulo
operativo migrado. Activar solamente la lectura introduciría IDs MariaDB en el
envío Supabase: se mantiene ese bloqueo explícito hasta adaptar los pedidos.
El contrato antiguo y sus pruebas se preservan mientras alimentan el recorrido
vigente; se sustituirán al activar la API, sin mantener ambos motores para el mismo
módulo.

## Verificación de esta sesión

```powershell
npm test
npm run lint
npm run build
```

372 pruebas en 28 archivos aprobadas, incluidas cinco del servicio nuevo; lint y
TypeScript/bundle aprobados. Prueba adicional del módulo TypeScript cargado por
Vite contra la API local `vivero-fresh-20261001c` y MariaDB con migración 021:
categorías activas, dos páginas sin repetir producto, búsqueda/filtro, lectura de
precios y resultado vacío. Fue una prueba del servicio/proxy, no de navegación UI.
Vite se cerró y Docker de prueba se detuvo conservando sus volúmenes.

No cambió SQL, backend, Android ni el contrato Supabase; no se repitieron sus
pruebas ni se tocaron datos reales. El script de integración está en tmp ignorado
de ViveroApp. No se instaló ninguna dependencia. No hubo commit, push o despliegue.

Archivos propios: servicio, `backend-catalog-service.test.ts`, esta guía y enlace
desde `backend-catalog-cutover.md`. Cambios previos de configuración, sesión API,
proxy, README y documentos preservados.

Siguiente incremento: consumidor API de pedidos públicos, clave de recuperación
e idempotencia y carrito con IDs enteros. La activación requiere también atención
administrativa con la sesión API; un pedido MariaDB no aparece en la bandeja
Supabase. Seguir el plan de corte autoritativo de ViveroApp.

Contrato de pedidos públicos API preparado y probado: [backend-web-public-orders.md](backend-web-public-orders.md). El carrito y la interfaz siguen en Supabase hasta su integración coordinada con atención administrativa.
