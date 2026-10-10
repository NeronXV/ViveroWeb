# Etapa 2: comprobante del catálogo público

Implementación y pruebas locales del 9 de octubre de 2026. Alcance exclusivo:
comprobante, recuperación de sus partidas originales e impresión. No incluye
folios nuevos, cancelación de ventas, simplificación de Caja o rediseño Android.

## Resultado

- El comprobante público usa una raíz propia en un portal. Durante la impresión
  solo esa raíz se representa: quedan fuera catálogo, carrito, botones y otros
  comprobantes. Las clases se limpian también si `window.print()` falla.
- Incluye fecha, folio existente, sucursal, productos, cantidades, precios,
  subtotal, descuento si aplica y total MXN. Estado visible: **Pendiente de pago
  en sucursal**. Aclara que acredita el registro del pedido, no el pago.
- Formatos A4/PDF, térmica de 80 mm y térmica de 58 mm. El usuario debe seleccionar
  el mismo ancho en el controlador, escala 100 % y desactivar encabezados/pies.
- Consulta nueva de solo lectura `POST /api/v1/web-orders/ticket`, cuerpo `{}`,
  clave secreta en cabecera; no consulta pública por ID/folio. Respuestas actuales
  de envío/recuperación sin modificaciones. No se añadieron migraciones.
- Partidas tomadas de las instantáneas SQL confirmadas, no del carrito ni de
  precios actuales. Se validan aritmética, identidad del pedido, sucursal y
  renglones del intento original antes de liberarlo.
- Consulta/guardado fallido conserva clave y contenido originales. La última
  copia válida se guarda antes de limpiar el intento y queda accesible como
  “Ver último comprobante guardado” tras recargar. No guarda clave ni contacto.
- Imprimir/reimprimir no realiza llamadas HTTP ni crea pedidos, cobros o ventas.
  Se mantiene Copiar folio. Caja y etiquetas conservan código y perfiles propios.

## Validaciones nuevas

| Comando / prueba | Resultado |
|---|---|
| Backend `npm test` | 87 aprobadas |
| Backend `npm run check` | Correcto |
| Compose local `run --rm -T --build tests` | 25 SQL/HTTP aprobadas |
| Web `npm test` con generación de fixtures | 485 aprobadas; 1 HTTP opcional omitida por falta de su fixture, ajena a impresión |
| Web `npm run lint` / `npm run build` | Correctos |
| Chrome headless, CSS completo y componente real | Pedido breve: 1 página A4; pedido máximo de 25 renglones con nombres largos: 3 páginas; ambos sin catálogo ajeno |
| Chrome headless, térmica | Breve: 1 página de 80 mm y 1 de 58 mm; contenido y total comprobados |
| `node tests/verify-public-order-pdfs.mjs artifacts/public-ticket-stage2` | Todas las comprobaciones PDF aprobadas; 25 productos largos y total presentes |
| Regresión Caja/etiquetas con CSS HEAD frente al modificado | Mismos textos, dimensiones y número de páginas; comprobante público oculto |
| PDF renderizados con pypdfium2 e inspección visual | Renglones legibles, sin cortes; totales agrupados |
| `git diff --check` App/Web | Correcto; avisos habituales de conversión LF/CRLF |

La integración modificó nombre y precio de un producto ficticio tras confirmar:
el comprobante mantuvo el nombre original y precio promocional aceptado. Varias
consultas conservaron el conteo de pedidos, ventas, pagos y movimientos. Se
rechazaron clave desconocida, clave ausente/ID como clave, cuerpo con ID y URLs
con ID/consulta. Los secretos y contactos no aparecen en el documento.

Los primeros intentos de tests/build encontraron restricciones de sandbox en
loopback/realpath; las repeticiones autorizadas completaron correctamente.
El render de fixtures se movió fuera de `src` para no requerir dependencias Node
en la compilación de navegador. No se instalaron dependencias ni cambió el lockfile.

## Ensayo aislado y reproducción

Proyecto Docker nuevo `vivero-public-ticket-stage2`, volúmenes propios, API en
`127.0.0.1:33005`, redes 10.243.62.0/24 y 10.243.63.0/24. Datos sintéticos, ninguna
consulta ni modificación remota. Docker 29.7.2 recuperado conservando los sockets
residuales de Ingest/Secrets en carpetas hermanas; no se borraron volúmenes ni
configuración. Ese fallo de Docker puede repetirse en futuros arranques.
Al terminar las pruebas se detuvieron únicamente API y DB de este proyecto;
sus volúmenes se conservaron. No se detuvieron servicios de otros proyectos.

Desde Web, con las dependencias existentes:

```powershell
$env:PUBLIC_TICKET_RENDER_DIR = "$PWD\artifacts\public-ticket-stage2"
npm test -- tests/public-order-print-render.test.tsx
```

Los HTML cortos/largos/térmicos y de regresión se generan en esa carpeta ignorada.
Renderizar cada HTML con Chrome instalado usando `--headless --disable-gpu
--no-pdf-header-footer --print-to-pdf=<ruta absoluta del PDF>`, un perfil temporal
propio y la URL `file:///...` del HTML. Después:

```powershell
node tests/verify-public-order-pdfs.mjs artifacts/public-ticket-stage2
```

Los ejemplos son ficticios. La prueba de generación no sustituye el análisis de
PDF ni una impresión física. No se ejecutaron pruebas Android ni pgTAP: no cambió
código Android, SQL de esquema o Supabase. No se afirma aceptación presencial.

## Archivos de esta implementación

ViveroApp:

- `backend/src/web-orders.js`: lectura de instantáneas autorizada por clave.
- `backend/src/app.js`: ruta privada por posesión de la clave.
- `backend/test/integration.test.js`: comprobantes históricos, seguridad e invariantes.
- `docs/backend-web-orders.md`: contrato nuevo y límites.

ViveroWeb:

- `src/features/public-catalog/CartDrawer.tsx`: integración del comprobante y recuperación.
- `src/features/public-orders/backend-order-service.ts`: parser/lectura y persistencia.
- `src/features/public-orders/backend-order-coordinator.ts`: guardar antes de liberar intento.
- `src/features/public-orders/PublicOrderTicket.tsx`: contenido, portal, formatos y copia de folio.
- `src/styles/app.css`: estilos aislados y papel por formato.
- `src/features/public-orders/public-order-ticket.test.tsx`: pruebas de recuperación, integridad e impresión.
- `tests/public-order-print-render.test.tsx`: fixtures reproducibles y regresión de otros perfiles.
- `tests/verify-public-order-pdfs.mjs`: contenido, páginas y regresión PDF.
- `docs/public-order-ticket-stage2.md`: este reporte.

## Trabajo preexistente conservado

App `main` / HEAD `a58fd614b28920d7b39fee7cef2b67f1c16b0531`: modificaciones previas
en `.idea/misc.xml`, eliminación `.idea/planningMode.xml`, README,
app/build.gradle.kts y docs/release-readiness.md; docs SMTP/candidata/respaldos y
scripts sin seguimiento. No se tocaron esos archivos.

Web `main` / HEAD `5f9c4853e42cace586cdaeec13998668b3d204aa`: README,
docs/PROJECT_STATUS.md, docs/tasks/current.md, PurchaseDraftWizard,
purchases-api.test, purchases-service y PanelPage modificados; `tests/` ya contenía
backend-workflow-http.test.ts sin seguimiento. No se tocaron esos cambios; los
archivos nuevos de impresión en `tests/` son independientes.

## Riesgos y revisión pendiente

- Probar PDF desde el navegador de operación e impresora física de Pedro/Toni.
  El controlador puede imponer márgenes, longitud de papel o saltos distintos.
- El formato térmico usa páginas CSS de 297 mm de alto; ajustar el controlador
  para rollo/corte cuando corresponda. No se ha validado el corte físico.
- El nombre/código de sucursal se obtiene de la sucursal referenciada por el
  pedido: no existe historial de nombres. Su copia local conserva el texto
  recibido; una recuperación tras renombrar sucursal muestra el nombre vigente.
- La copia conserva el registro original y su aviso de pago pendiente; no consulta
  el estado actual de pago ni reemplaza comprobantes de Caja.
- Solo se guarda el último comprobante en ese navegador. Pedidos anteriores cuyo
  secreto/copia se perdió no pueden recuperarse públicamente por folio. Borrar el
  almacenamiento elimina esa copia, como ocurre con otros datos locales.
- Despliegue futuro autorizado: API primero, Web después. Si falta la ruta nueva,
  la Web conserva el intento; no se debe crear otro pedido para resolverlo.
- No se verificó el síntoma exacto de nueve páginas en producción. La corrección
  se comprobó de forma reproducible incluyendo un catálogo artificial de 600 párrafos.

Sin commit, push, despliegue, cambios de producción, activación de CENTRO,
reprocesamiento histórico ni avance a las siguientes etapas.
