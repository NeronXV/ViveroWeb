# Selección de fotografía móvil — 10 de octubre de 2026

Defecto bloqueante reproducido en Chrome 390×844: elegir un PNG válido creaba
una vista previa, pero el evento focus posterior hacía verificar la sesión,
desmontaba la ficha y perdía archivo, formulario y error local. El handler change
sí procesaba el archivo. El error no provenía de una carga rechazada por la API:
la fotografía desaparecía antes de que pudiera guardarse.

## Corrección

La sesión distingue refreshing de la carga inicial. Durante una revalidación
conserva la vista previamente verificada y RequireAccessContext mantiene la ficha
montada dentro de un contenedor inert, con mensaje de espera. backend-runtime
continúa rechazando todas las solicitudes hasta accessStatus=ready. No se elimina
la revalidación de foco/visibilidad, no se prolonga la sesión y no se cambia
autorización del servidor. Error de acceso, expiración, logout y revocación siguen
cerrando el acceso; cambio de sucursal/capacidades conserva los mecanismos de
invalidación existentes.

PlantDetail y CatalogingBoard capturan el File antes de limpiar el input y
permiten volver a elegir el mismo archivo. Cancelar conserva la selección previa.
La vista previa indica explícitamente que no está guardada; un botón separado
guarda la fotografía. Errores de formato/tamaño, creación de preview, decodificación
y carga quedan visibles. El éxito confirmado indica «Fotografía guardada en el
servidor» junto a la imagen. El guardado combinado de ficha/foto también lo indica.
No se deduce el formato por extensión ni se amplía el contrato JPEG/PNG/WEBP,
5 MiB. No hay carga automática ni reintento automático ante una respuesta incierta.

## Validaciones de esta corrección

- Reproducción ANTES: selección válida desaparece al revalidar foco (0 imágenes
  frente a 1 esperada).
- Chrome móvil con fixture HTTP sintético, SIN MariaDB/VPS: PASS en ambos órdenes
  focus/change; cancelación; formulario sin guardar preservado; controles inert
  durante revalidación; error de carga con selección preservada; éxito y consulta
  de foto guardada; error de archivo no admitido preservado; revocación de permisos
  retira el editor; ausencia de desbordamiento horizontal.
- Pruebas específicas: 25 aprobadas. Suite completa: 539 aprobadas, una HTTP
  opcional omitida por carecer de su fixture. No es una nueva prueba contra MariaDB.
- npm run build y npm run lint aprobados. Vitest en sandbox falló por EPERM de
  realpath; las pruebas se ejecutaron después con permisos de lectura locales.
- Evidencia/snapshots anteriores y capturas: artifacts/photo-selection-20261010,
  especialmente release-verified/result.json y sus dos capturas móviles.

## Alcance

Sólo Web. No hay SQL, migraciones, cambios de API, datos, precios, inventario o
ventas. Caja no recibió modificaciones propias; la frontera compartida de acceso
se verificó con la suite completa. Los cambios anteriores de POS, 033/034 y panel
se conservaron. No se añadieron dependencias ni se modificó package-lock.

La cámara/galería física necesita aceptación en el teléfono de la usuaria. La
regresión usa Chrome móvil y archivo sintético; no acredita el selector nativo
de cada Android/iOS. Una recarga completa, logout, expiración o cierre forzoso
del navegador todavía pueden descartar archivos locales sin guardar.

## Publicación verificada

Web publicada: `20261010-photo-c65f05be3212`, en
`https://viverodulcinea.bajastack.network`, a las 19:36:38 UTC.
Los 24 archivos nuevos y los assets anteriores conservados (33 archivos en total)
coinciden por SHA-256 mediante HTTPS. Inicio, login, Administración, Caja, catálogo
y health responden 200; endpoints protegidos sin sesión responden 401.
No hay CSP del documento que bloquee la vista previa blob.

Se sustituyó sólo Web, con los Compose efectivos anteriores más
`images.photo.yaml`, `--no-deps --no-build --pull never`. API, MariaDB, proxy y
Catering conservaron IDs, imágenes, inicios, reinicios y configuración. Catering
`/health/ready` HTTPS 200. No hubo SQL, migración, pruebas autenticadas productivas,
ventas, cargas de fotos reales ni importación de los 174 borradores por herramientas.

Imagen Web anterior conservada y exportada en la carpeta remota nueva de esta
entrega; overlay `rollback.web.yaml` permite revertir sólo Web. Se conserva el
respaldo MariaDB cifrado y recuperable verificado en la publicación 034 anterior;
esta corrección no tomó otro respaldo ni modificó MariaDB. Una recuperación SQL
no forma parte del rollback de Web.

Archivos propios: backend-session.ts y su prueba; AccessGuards.tsx/access-types.ts;
PlantDetail.tsx, PlantPhoto.tsx, CatalogingBoard.tsx; photo-selection.ts;
tests/photo-selection-browser.mjs y este informe. Los cambios preexistentes de
ambos proyectos permanecen. Git main, HEAD Web f208ffb1dabf8db5d740a5c17cab7a09d33236d6
y App 239411caeefc715feb55c9a8fa21163c218a9fde; sin commit/push. Evidencia y paquete
ignorados en artifacts/photo-selection-20261010. No quedaron servidores o
navegadores locales del ensayo en ejecución.

Para aceptar desde el celular: recargar la Web e iniciar sesión de nuevo. Abrir
una ficha → Elegir fotografía → seleccionar JPEG/PNG/WEBP de hasta 5 MiB.
Debe aparecer de inmediato la imagen y el botón Guardar fotografía. Después de
guardarla, verificar el mensaje «Fotografía guardada en el servidor» y que la
imagen reaparece al salir y abrir otra vez la ficha. La aceptación física aún
no se ha ejecutado por las herramientas.
