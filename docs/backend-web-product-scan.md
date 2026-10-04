# Escaneo de productos: Backend API y consumidor Web

Implementado y validado localmente el 2026-10-01. Amplía el consumidor de mostrador
existente; no cambia todavía el compositor, el escáner visible ni AuthProvider.

## Contrato oficial

POST `/api/v1/products/scan`, cuerpo exacto `{ code: string }`, sesión API activa
y VIEW_CATALOG, siguiendo el permiso del contrato Supabase de referencia
`202609010003_product_scan_lookup.sql`. No exige CREATE_SALES ni sucursal para
consultar un producto; crear ventas mantiene sus permisos y sucursal propios.
No acepta parámetros de consulta ni formas de cuerpo adicionales.

Respuesta `{ schema_version: 1, item }`, con item null cuando no está disponible,
o producto en el mismo formato del catálogo API: ID entero, cuidados, imagen API,
precio de lista, precio efectivo y promoción activa. No incluye precios mayoristas
ni existencias de sucursal; no sustituye el RPC completo usado por Android.
El código viaja en JSON, no en URL. Sin cambios de tablas, migraciones o índices.

Código recortado en los extremos, longitud de 2 a 128 caracteres, sin controles
ni Unicode mal formado. Búsqueda exacta por código interno o barcode: conserva
ceros iniciales, ignora mayúsculas y distingue acentos. SQL parametrizado con
LOWER/TRIM y collation binaria explícita; no usa LIKE ni coincidencias parciales.
El resultado y su precio se leen en una sola sentencia/snapshot del servidor.

Dos productos activos coincidentes producen 409 PRODUCT_SCAN_CODE_AMBIGUOUS, nunca
se elige el primero. Un producto que coincide en ambos campos cuenta una sola vez.
La detección de ambigüedad cuenta productos activos incluso si la categoría está
inactiva, conforme al contrato anterior; tras resolver una coincidencia única,
producto o categoría inactivos no se ofrecen para venta.

## Consumidor Web

`createBackendCounterSaleService().scan(token, code, signal?)` en
backend-counter-sale-service.ts. Envía POST al proxy del mismo origen y valida
versión/formato del producto con el parser de catálogo ya existente. Preserva el
precio efectivo del servidor. Diferencia producto ausente de código ambiguo con
mensaje seguro; no cambia backend, crea ventas ni interpreta el código como ID.
Sin cookies, caché o redirecciones, timeout de diez segundos y cancelación.

Servicio todavía no importado en UI. La búsqueda/escaneo actuales, sesión y Caja
siguen usando Supabase hasta el corte coordinado. No hay ruta, provider o selector
paralelo. No se declara una pantalla de escaneo API ya migrada.

## Validación de esta sesión

Web: `npm test` (407 pruebas en 32 archivos, incluidas dos nuevas), `npm run lint`
y `npm run build`, aprobados. Backend Docker: `npm test` (59 unitarias),
`npm run check` y `npm run test:integration` (23 integraciones), aprobados.

La integración nueva de escaneo comprueba permisos, códigos con ceros, búsqueda
normalizada y exacta, promoción aplicada, ausencia de mayorista, formatos inválidos,
ambigüedad interna/barcode, categorías y productos inactivos y distinción de acentos.
Sus productos, categorías, usuarios/sesiones y promoción son sintéticos y se retiran
al terminar. No hay escrituras de ventas ni movimientos de stock.

Prueba adicional del servicio TypeScript real cargado por Vite → API → MariaDB/021:
código normalizado, ID entero, precio coincidente con catálogo, resultado ausente
y sesión revocada. Sin mutar datos del catálogo. No acredita lectura de cámara,
dispositivo físico o navegación UI. Vite cerrado, entorno de prueba detenido y
volúmenes conservados; entorno previo saludable. Script/configuración local en
tmp ignorado de ViveroApp, sin secretos mostrados. Android y SQL sin cambios;
sus compilaciones y pgTAP no se repitieron.

Para repetir desde ViveroApp con .env local configurado:

```powershell
docker compose --env-file .env -f infra/docker/compose.yaml up -d --build --wait api
docker compose --env-file .env -f infra/docker/compose.yaml --profile test run --build --rm tests node --test test/scan-integration.test.js
```

Archivos de esta entrega en ViveroApp: backend/src/catalog.js, backend/src/app.js,
backend/test/unit.test.js, backend/test/scan-integration.test.js, backend/package.json,
infra/docker/compose.yaml y referencias de arquitectura/mapa. En ViveroWeb:
backend-counter-sale-service.ts, su prueba, esta guía y referencia en
backend-web-counter-sales.md. Cambios preexistentes preservados; main en ambos
repositorios. Sin commit, push, operación remota o despliegue.

Siguiente incremento: contratos complementarios necesarios de Caja (historial,
devoluciones y cortes) y asociación de cliente si se conserva en el mostrador API,
antes de conectar la sesión y pantallas vigentes a la API. El límite y estado de
corte siguen documentados en backend-web-counter-sales.md.

Incidencia de validación: la primera suite completa terminó 21/23 por dos pruebas de autenticación que recibieron 429 al agotar el presupuesto IP de ejecuciones locales repetidas. Se expiró únicamente el contador de la IP del contenedor de pruebas antes de repetir, manteniendo la política de límites API sin cambios.

Repetición final: 23/23 integraciones aprobadas, incluidas las dos de autenticación y el escaneo. Contador ajustado solo en el entorno sintético local; no hubo cambio de configuración ni política del servidor.
