# Navegación administrativa permanente — 10 de octubre de 2026

Corrección local y publicación Web completadas. Versión: `20261010-navigation-4488b9dc39b5`.
No se modificaron API, migraciones, roles, permisos, sucursales ni datos comerciales.

## Causas y corrección

El menú anterior calculaba `secondaryModules` excluyendo el módulo activo y mostraba sólo los destinos del grupo actual. Seleccionar Personal o Sucursales cambiaba las opciones visibles. Además, `canReceive` inicialmente falso trasladaba Compras entre Administración y Recepción al recibir permisos. El estado `tab` duplicaba el parámetro URL con un efecto posterior al render.

Ahora un único `AdminNavigation` presenta todos los grupos y módulos autorizados, incluido el seleccionado con `aria-current="page"`. El grupo activo se deriva del destino; `tab` se deriva directamente de la URL y los módulos autorizados. Compras permanece en Recepción; las acciones operativas conservan los controles efectivos del servidor. Caja enlaza a `/caja` sólo cuando `canEnterCashier` lo autoriza. No se incorporan pantallas sin implementación.

Plantas conserva catálogo y revisión en su pantalla existente, más Existencias y conteos. Recepción reúne las compras, proveedores y recorridos de recepción existentes en Compras y proveedores. Ventas conserva Caja, pedidos, reportes y promociones autorizadas. Administración mantiene Personal y permisos, Sucursales, Clientes y Boletín Verde.

El shell premium se comparte entre módulos. Se retiraron únicamente los selectores de layout `.admin-plants-active` después de eliminar su única activación; no quedan referencias productivas. Se retiraron los estilos y lógica del menú de herramientas colapsable sustituido. No se eliminaron módulos ni código histórico de negocio. Teclado usa controles HTML nativos, Tab y Enter, con foco visible. En móvil los cuatro grupos se presentan en dos columnas y todos los destinos autorizados permanecen visibles.

El directorio fallaba porque `COUNT(*)` de MariaDB se entrega como cadena con `mysql2` configurado con `supportBigNumbers: true` y `bigNumberStrings: true`. `backend/src/administration.js` conserva esas cadenas; `backend-admin-request.ts` las pasaba directamente a `safeInteger`, que exige números. `directoryCount` convierte exclusivamente cadenas canónicas no negativas o números enteros seguros. Rechaza nulos, booleanos, decimales, notación exponencial, contenido malformado y desbordamientos. Se corrigen ambos contadores: personal activo y ventas pendientes. No hay sustitución por cero ni cambios de contrato API.

## Archivos propios

Sobre archivos preexistentes, conservando sus otros avances:

- `src/features/access/admin-navigation.ts`
- `src/features/access/admin-navigation.test.ts`
- `src/features/admin/AdminNavigation.tsx`
- `src/features/admin/AdminPage.tsx`
- `src/features/admin/admin-navigation.css`
- `src/features/admin/plants/plants.css`
- `src/features/admin/backend-admin-request.ts`

Nuevos:

- `src/features/admin/branch-directory-count.test.ts`
- `tests/admin-navigation-browser.mjs`
- Este informe.

Las pruebas históricas `backend-admin-request.test.ts` permanecen con su contenido original. ViveroApp se inspeccionó sin modificaciones.

## Validación nueva

- `npm test`: 562 aprobadas, una omitida; incluye acceso, parsers, Caja, compras e inventario. La omitida es el recorrido HTTP opcional que necesita un entorno de integración.
- `npm run lint`: aprobado.
- `npm run build`: TypeScript y bundle aprobados en el árbol local. El candidato aislado también pasó TypeScript y Vite.
- `node tests/admin-navigation-browser.mjs`: 23 comprobaciones aprobadas sobre el bundle exacto del candidato. Chrome real en loopback con contratos sintéticos; cero escrituras comerciales. Verifica los cuatro grupos, opciones estables, módulo activo, navegación por URL dentro de la SPA, login al abrir una URL completa sin sesión en memoria, destinos no autorizados, Caja, inventario, Sucursales y protección de ficha sin guardar.
- Capturas e inspección en 390, 768, 1024 y 1440 px, sin desbordamiento horizontal de documento y con controles de al menos 48 px. Capturas con animaciones deshabilitadas para observar la apariencia final.
- `git diff --check`: aprobado en ambos repositorios. Diff propio comparado con copias previas de los archivos solapados. Sin secretos ni cambios ajenos en la entrega.

Los primeros intentos de Vite encontraron EPERM del sandbox; se repitieron fuera de éste. Al crear copias de revisión, Vitest descubrió sus pruebas antiguas: esos primeros resultados no se consideran aprobación. Las copias propias ahora llevan extensión `.fixture`; la suite normal final pasó sin exclusiones adicionales. Los ensayos de navegador se completaron tras incorporar las respuestas sintéticas exigidas por los módulos existentes. No se hicieron pruebas autenticadas en producción, cobros físicos ni aceptación humana.

## Paquete, respaldo y publicación

Había cambios locales anteriores del carrito que no estaban publicados. En una copia aislada se conservaron las versiones productivas de `CartDrawer.tsx` y `backend-order-service.ts`, dejando intactas sus correcciones locales. El bundle de referencia reprodujo los 24 archivos y hashes exactos de la entrega de fotografías. Se incorporaron únicamente los seis archivos de producción de esta tarea. La Web publicada no incluye las correcciones ajenas del carrito.

Docker local no expuso un motor utilizable. La imagen se construyó en el VPS confirmado por Hostinger/SSH, sobre la etiqueta local de la Web activa comprobada por ID, sin pull, dependencias ni cambios a servicios. Se conservan los assets anteriores dentro de la imagen para las sesiones abiertas.

- VPS confirmado: Hostinger 2030059, `srv2030059`.
- Imagen publicada: `sha256:38f93f0a2bebaf308e6aa75b27148b85e1cf102606e770268565aa7a87f95d19`.
- Etiqueta: `vivero-web-navigation:20261010-navigation-4488b9dc39b5`.
- Imagen anterior: `sha256:8728d76bca4a265800b6c1fb1197208f9b538e4a2d4cb28017413acb7fac2df2`.
- Carpeta remota: `/srv/apps/vivero-dulcinea/releases/20261010-navigation-4488b9dc39b5`.
- Imagen anterior exportada en `web-before.tar`; SHA-256 `7822c627e45e5026b5d89d03d868d72ac40412952a3e6bb19c17d5e0143fa249`.
- Respaldo recuperable anterior de esquema 033: archivo `vivero-2026-10-10T18-47-21-838Z-db3c1172-8cc0-4561-a348-22962badd7c1-verified-complete-recovery.tar.gz` bajo `/var/backups/vivero`, hash verificado nuevamente `af10d5aa54800307e64508dce71dee414dc9d37761b93dd09616104bda2c5708`. Su descifrado/restauración completa es evidencia previa en `ViveroApp/tmp/deploy-cataloging-034/recovery-kit/restore-verification.json`, no una restauración nueva de esta sesión. No se tomó un respaldo SQL nuevo ni se acredita ese respaldo 033 como instantánea del esquema productivo 034 actual. El rollback de esta actualización es exclusivamente de imagen Web y no requiere restaurar SQL.
- `rollback.web.yaml` apunta a la imagen anterior. Para revertir sólo Web, confirmar primero estado/destino, usar todos los Compose efectivos documentados por el contenedor y agregar ese overlay al final; ejecutar únicamente `up -d --no-deps --no-build --pull never web`. No revertir SQL ni mover `current`.

Antes de publicar, Compose efectivo coincidió en todo salvo la imagen Web. Caddy validó la configuración existente. Se recreó exclusivamente Web con `--no-deps --no-build --pull never`. API, MariaDB, proxy y Catering mantuvieron IDs, imágenes, inicios, reinicios y configuración. No hubo migraciones, ventas, pagos, movimientos, cambios de permisos ni importaciones.

Después: 200 en `/`, `/health`, `/login`, `/admin?tab=sucursales`, `/admin?tab=stock`, `/caja` y `/catalogo`; 401 sin sesión en identidad, directorio administrativo, Caja y permisos de inventario. Los 24 archivos del candidato y los assets anteriores, 43 en total, coinciden por hash mediante HTTPS. Catering `/health/ready` responde 200. Estos HTTP verifican entrega y protección, no una sesión autenticada de operador.

Evidencia propia ignorada por Git: `artifacts/admin-navigation-release/`, con manifiesto, baseline, build aislado, capturas, resultados y fases `stage`, `prepared`, `published`.

## Revisión manual

Recargar e iniciar sesión con cada cuenta pertinente. Revisar:

- `/admin?tab=inventario`: catálogo, revisión existente, ficha y protección de cambios sin guardar.
- `/admin?tab=stock`: existencias/conteos, sin ejecutar operaciones reales sólo para validar navegación.
- `/admin?tab=compras`: compras/proveedores y recepción según permiso efectivo.
- `/admin?tab=ventas`, `/admin?tab=pedidos`, `/admin?tab=promociones` según permisos.
- `/admin?tab=personal`, `/admin?tab=sucursales`, `/admin?tab=clientes`, `/admin?tab=boletin` según permisos. Confirmar conteos reales en Sucursales.
- `/caja`: acceso, pendientes y presentación; cobro/impresión requieren aceptación operativa propia.

Probar escritorio y celular, retroceso/avance del navegador y que cada grupo conserve sus opciones al seleccionar destinos. La sesión actual sigue usando token en memoria; recargar requiere login. No se alteró esa política ni la lista cerrada de `returnTo`.

## Trabajo preexistente y Git

Ambos repositorios conservan sus cambios previos de Android, API, catalogación, inventario, fotografías, POS, carrito y documentación. Los archivos solapados se respaldaron antes de editar; los cambios locales ajenos del carrito se excluyeron sólo de la copia de entrega. No se hicieron git add, commit, push, pull, merge ni rebase.

Web: `main`, HEAD `f208ffb1dabf8db5d740a5c17cab7a09d33236d6`, árbol con modificaciones y archivos sin seguimiento previos y propios. App: `main`, HEAD `239411caeefc715feb55c9a8fa21163c218a9fde`, estado preexistente conservado, sin cambios propios. No se actualizó el reporte n8n porque no se solicitó cerrar sesión ni sincronizar seguimiento.
