# Revisión de documentos de recepción

Implementación publicada el 20 de octubre de 2026 en Web y API. Continúa usando
la API/MariaDB autoritativa de ViveroApp. Pedro comprobó manualmente el lector con
dos documentos diferentes: un ticket y una cotización. El guardado de una
recepción real todavía no se ha probado y permanece pendiente de aceptación.

## Uso

1. Abrir Compras y proveedores → Nueva Recepción / Cotización. Elegir proveedor
   y capturar el folio si existe.
2. Cargar PDF con texto, Word `.docx` o CSV; también se puede pegar una lista o
   capturar manualmente. CSV recomendado:

   ```csv
   Nombre,Contenedor,Cantidad,Costo Unitario
   Planta de ensayo,B6,3,25.00
   ```

3. Comparar las partidas con la vista previa local del PDF. En escritorio se
   presentan en tabla; en móvil, en bloques. Las descripciones, cantidades del
   documento y costos pueden corregirse antes del primer guardado.
4. Buscar cada planta o aceptar una sugerencia por nombre. Las sugerencias no
   seleccionan productos automáticamente. Para una planta nueva, elegir
   explícitamente crear una ficha pendiente. La cantidad recibida puede ser
   distinta de la documentada; cero significa que no llegó.
5. Revisar la suma contra el total del documento. Si el lector detectó un total,
   borrarlo o dejar una diferencia impide avanzar. En documentos sin total
   detectado puede capturarse manualmente. Esta comparación usa cantidades del
   documento, permitiendo recepciones parciales.
6. Marcar la revisión y continuar o guardar y salir. La última pantalla muestra
   el importe recibido que devuelve el servidor y las unidades identificadas o
   pendientes. Registrar llegada conserva las reglas actuales de permisos,
   preparación de plantas e inventario.

## Compatibilidad y límites

- El lector térmico reconoce Cant / Descripción / Total, ordena por coordenadas,
  une las continuaciones y distingue el precio unitario entre paréntesis del
  total de la partida. Omite marcas diagonales y encabezados. Otros formatos
  conservan el lector genérico con revisión manual obligatoria.
- Encabezados e importes no son nombres válidos. Los códigos de proveedor no se
  convierten en dinero eliminando sus letras. Las lecturas incompletas generan
  avisos; un archivo que no produce partidas conserva la lista que ya se editaba.
- PDF y vista previa se procesan localmente. No se almacenan copias del documento
  ni se incorpora OCR; fotos/escaneos requieren captura manual. Máximo 10 MB y
  30 páginas por PDF; la API mantiene su límite de 100 partidas y de cuerpo HTTP.
- Los costos de un borrador guardado siguen siendo inmutables. No se reparan
  retroactivamente documentos ya guardados con lecturas incorrectas. Comprobar
  guardado y resolver intento anterior conservan el diario y las claves existentes.
- El backend aprende equivalencias por proveedor/descripción/envase al revisar
  una planta existente en la recepción simplificada, igual que en la revisión
  individual. Se reutilizan al crear futuros borradores. Las sugerencias previas
  al guardado son por nombre; requieren decisión humana. Cantidad cero y fichas
  nuevas no borran equivalencias. No cambia precios de venta ni inventario al revisar.
- No cambian contratos HTTP, migraciones, dependencias ni flujos de Android.

## Validación ejecutada

- `npm test -- src/features/admin/purchases --exclude 'artifacts/**'`: 52 pruebas.
  TEMP/TMP se dirigieron a `artifacts/reception-validation/temp` por una restricción
  de renombrado de archivos temporales del sandbox; se excluyen copias históricas.
- `npm run lint` y `npm run build`: correctos.
- `node tests/reception-browser.mjs`, con `BROWSER_TEST_MODULES` apuntando a los
  módulos del runtime: servidor HTTP sintético, Chrome y bloqueo de destinos
  externos. PDF con texto escrito fuera de orden, vista previa, nombres, costos,
  coincidencias explícitas, diferencia de total, entregas parciales/cero,
  costos guardados inmutables y confirmación única; escritorio y móvil sin desborde.
  El acceso loopback requirió ejecución fuera del sandbox; se cierran los procesos.
- PDF externo proporcionado por Pedro: lectura completa y suma conciliada;
  archivo y datos personales no incorporados a fixtures, código ni documentación.
- ViveroApp: tres pruebas unitarias de compras y 31 pruebas HTTP/SQL de la suite
  nativa de catalogación/recepciones en MariaDB 11.4.13, incluida la nueva prueba
  de equivalencias, reintento, aislamiento por proveedor y rollback transaccional.
  Base sintética nueva mediante `backend/scripts/test-cataloging-local.ps1`;
  Docker estaba apagado. El servidor de pruebas quedó detenido.

Publicación verificada: rutas internas y HTTPS público, 27 archivos Web
contrastados por hash y rechazo de acceso sin sesión. No se repitieron las suites
completas durante la publicación. La aceptación manual del lector comprende un
ticket y una cotización; no acredita guardado ni movimientos reales.
Pendiente: guardar una recepción real y comprobar sus efectos autorizados. La
cámara Android queda fuera del alcance de esta entrega.

## Archivos de esta entrega local

ViveroWeb:

- `src/features/admin/purchases/ReceptionWizard.tsx`
- `src/features/admin/purchases/ReceptionReviewTable.tsx` (nuevo)
- `src/features/admin/purchases/ReceptionPdfPreview.tsx` (nuevo)
- `src/features/admin/purchases/purchases-extractor.ts`
- `src/features/admin/purchases/purchases-pdf-layout.ts` (nuevo)
- `src/features/admin/purchases/reception-review.ts` (nuevo)
- `src/features/admin/purchases/reception.css`
- `src/features/admin/purchases/purchases-pdf-layout.test.ts` (nuevo)
- `src/features/admin/purchases/reception-review.test.ts` (nuevo)
- `tests/reception-browser.mjs`
- `docs/reception-document-review.md` (nuevo)

ViveroApp:

- `backend/src/purchases.js`
- `backend/test/cataloging-integration.test.js`
- `docs/backend-purchases.md`

Se conservaron los tres cambios preexistentes en ViveroApp: `.idea/misc.xml`,
`BackendSalesPolishTest.kt` y `BackendSalesUiTest.kt` dentro de
`app/src/androidTest/java/com/intutec/viveroapp/feature/sales/`.
ViveroWeb empezó limpio. No se ejecutaron compilaciones Android ni pruebas
instrumentadas: no se modificaron Kotlin, Gradle ni contratos consumidos por Android.
Tampoco pgTAP o verificación de migraciones: no cambió SQL.

## Punto de recuperación en GitHub

Etiqueta coordinada en ViveroWeb y ViveroApp:
`prod-reception-pdf-2026-10-20`. No representa una nueva release de aplicación.

- Base Web: `224e09bac59ca748ccab131c1b50dd88b0f269cf`.
- Base API: `1910b06fc74b38ed40cb5ae61ce9b77a96f52da1`.
- Imagen Web publicada: `vivero-web-reception:20261020-reviewed`,
  `sha256:3ee3d2ff511aa1da5a339df21bb2734be339b887e42ec46d2f253c5ee8187f1a`.
- Imagen Web base preservada:
  `sha256:37cba85281e1c01f434b5858d4fa7b206cc867a29f9db6a138848dc51e9ef6b5`.
- Imagen API publicada:
  `sha256:be7ff9a22a3adeac36ec6408c53486488a827b42514646d70ae5be502eec993c`.
- Paquete aprobado SHA-256:
  `c79b9edf1e14440b78ce0240b713b12ea72195e10dc5f89d1cd290e9d5f217db`.
- Inventario de 250 archivos de entrada Web, con CRLF normalizado a LF:
  `cb4070e37755bd5260d92fe7eb6ce2f9c1f0d0a3b9b30f65f41d69b9277b0a44`.

Se contrastaron las fuentes del manifiesto con el árbol de trabajo y con los
blobs Git preparados. Los cambios posteriores al manifiesto son exclusivamente
documentación de publicación y aceptación. El inventario normalizado ordena las
rutas relativas y calcula SHA-256 sobre líneas `ruta sha256_del_contenido\n`.

El lockfile conserva dependencias y el commit permite reconstruir el código
funcional publicado. No se promete el mismo digest Docker al reconstruir:
la entrega añadió el bundle a una imagen Web existente y conservó archivos
estáticos históricos; Dockerfiles generales usan bases móviles. La reconstrucción
exacta exige las imágenes base citadas, el paquete y la configuración de build
original. Los artefactos compilados, respaldos y configuración privada quedan
fuera de Git; la etiqueta es un punto de recuperación de fuentes, no un respaldo
de la base de datos. No se cambian migraciones ni contratos HTTP.
