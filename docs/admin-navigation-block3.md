# Bloque 3 — Navegación administrativa por tareas

Implementación local del 10 de octubre de 2026, detenida para revisión visual.
No se modificaron backend, contratos, permisos, Android ni producción.

## Resultado

- Menú organizado en Plantas, Recepción, Ventas y Administración. Sólo se
  muestran grupos y destinos autorizados; las capacidades existentes siguen
  controlando el montaje de cada módulo.
- Plantas reúne catálogo y herramientas de existencias/conteos. En móvil estas
  últimas están detrás de «Opciones de plantas», no en una barra saturada.
- Recepción aparece únicamente cuando `can_receive` del servidor lo permite y
  el módulo de compras ya está autorizado. Sin ese permiso, la consulta existente
  de compras se conserva bajo Administración, como «Consultar compras»; esto no
  concede recepción ni aprobación. No se comparan roles para conceder acciones.
- Ventas conserva reportes, pedidos y promociones según capacidades. Personal,
  sucursales, clientes y boletín se conservan en Administración. Caja POS conserva
  su ruta y acceso desde el panel interno; no se cambió su flujo.
- Entrada administrativa por defecto en Plantas si está autorizado. URLs previas
  `?tab=...`, filtros, protección de cambios sin guardar y sesión se conservan.
  Los módulos sin contrato implementado no se ofrecen como funciones disponibles.
- Sesión compacta en todos los módulos. Navegación por teclado con flechas,
  Home/End, foco visible y botones de al menos 48 px en el menú.
- Ficha más compacta: fotografía protagonista con proporción horizontal en
  móvil, menos encabezados repetidos y espacios. El estado de planta lista se
  muestra una vez; los requisitos pendientes y advertencias siguen visibles.
- «Guardar y siguiente» es la acción principal, antes de los detalles opcionales;
  guardar ficha, conteo, QR e historial conservan accesos secundarios. No cambiaron
  PATCH, validaciones, carga de foto, activación ni secuencia de productos.
- Propietarios pueden abrir conteos pendientes desde el listado o la ficha.
  Tarjetas con planta, cantidad registrada al contar, observada, diferencia y
  motivo. Revisar conserva aprobación/rechazo con motivo, diario y recuperación.
  La diferencia visible es informativa: el servidor verifica movimientos y
  vigencia de la referencia antes de aplicar cualquier decisión.

## Archivos de este bloque

Nuevos:

- `src/features/access/admin-navigation.ts`: agrupación de destinos autorizados.
- `src/features/access/admin-navigation.test.ts`: pruebas de agrupación/permisos.
- `src/features/admin/AdminNavigation.tsx`: menú principal y opciones secundarias.
- `src/features/admin/admin-navigation.css`: estilos delimitados al panel.
- Este informe.

Modificados sobre los avances del bloque anterior:

- `src/features/admin/AdminPage.tsx`: conexión del menú y entrada en Plantas.
- `src/features/admin/InventoryCountReview.tsx`: presentación en tarjetas.
- `src/features/admin/plants/AdminPlants.tsx`: revisión opcional de propietarios
  desde el listado y clase para compactar la ficha.
- `src/features/admin/plants/PlantDetail.tsx`: posición/jerarquía de acciones y
  eliminación del resumen repetido cuando la planta ya está lista.
- `tests/plants-browser.mjs`: extensión del ensayo existente, ahora guarda
  resultados en `artifacts/plants-block3/`; evidencia anterior de bloque 2 conservada.

No se modificaron los servicios de inventario/productos ni las reglas de acceso.
No hay dependencias nuevas ni cambios de lockfile.

## Verificaciones realizadas

```text
npm run build
npm run lint
npm test -- src/features/access/admin-navigation.test.ts src/features/admin/plants/plants.test.ts src/features/admin/inventory-preparation-service.test.ts
node tests/plants-browser.mjs
git diff --check
```

El navegador usa Playwright y Sharp del runtime ya instalado en esta PC mediante
`BROWSER_TEST_MODULES`. Chrome real sirve el bundle compilado exclusivamente en
loopback con contratos sintéticos en memoria. No accede al VPS ni MariaDB.

- Build y lint aprobados; 24 pruebas focalizadas aprobadas en tres archivos.
- Agrupación conserva todos los módulos implementados autorizados exactamente
  una vez, sin conceder módulos adicionales ni Recepción por inferencia de rol.
- Navegación móvil/escritorio de gerente y propietario, opciones secundarias,
  destinos Ventas/Administración y regreso con Home aprobados.
- Cambiar de tarea con una ficha modificada conserva el bloqueo previo. También
  se comprobó cerrar sesión sin descartar cambios.
- Edición parcial, fotografías con error/reintento, QR, filtros y guardar/siguiente
  conservan el recorrido del bloque 2.
- Respuesta de conteo truncada después del guardado simulado: recuperación con
  la misma clave, una observación y sin modificar saldo al registrar. Decisión de
  propietario conserva recuperación y actualización de ficha/listado.
- Sin desbordamiento en 390/768/1024/1440 px, ni con texto al 200 %. Una ventana
  de 390×460 permite desplazarse hasta Guardar; área táctil de al menos 48 px.
- Sin solicitudes de ventas, cobros, recepción o conteo directo. Servidor y
  navegador de ensayo se cierran al finalizar.

## Capturas

Doce capturas reales del navegador con datos sintéticos identificados en pantalla,
en `artifacts/plants-block3/`. [Galería local](../artifacts/plants-block3/gallery.html).

- `01-manager-mobile.png`, `02-manager-desktop.png`: navegación de gerente.
- `03-mobile-detail.png`, `04-mobile-photo-edit.png`: ficha y edición.
- `05-mobile-pending.png`, `06-mobile-count.png`: preparación y conteo.
- `07-owner-mobile.png`, `08-owner-desktop.png`: navegación y tarjetas de propietario.
- `09-owner-review.png`: revisión desde la ficha.
- `10-tablet-portrait.png`, `11-tablet-landscape.png`, `12-desktop.png`: tamaños mayores.

`results.json` contiene los resultados del navegador. Fotografías existentes del
proyecto usadas como ejemplos, no nuevas fotografías de plantas reales.

## Límites y revisión pendiente

- Pruebas de navegador con contratos simulados, no aceptación nueva del backend.
  No se repitieron las suites MariaDB del bloque 1 ni recorridos ajenos al cambio.
- Cámara/teclado físicos y aceptación por gerente/propietarios siguen pendientes.
- Conservar los límites de fotografías y recuperación del bloque 2: formularios
  no guardados en memoria, sin deduplicación garantizada de cargas inciertas.
- Publicación conjunta requiere backend del bloque 1 y migración 033, aún no
  aplicada en producción. Este trabajo no prepara ni ejecuta esa publicación.

## Conservación de cambios

ViveroWeb sigue en `main`, HEAD `f208ffb1dabf8db5d740a5c17cab7a09d33236d6`.
ViveroApp sigue en `main`, HEAD `239411caeefc715feb55c9a8fa21163c218a9fde`.
Trabajo anterior de bloques 1/2, POS y documentos preservado. Se guardaron copias
locales ignoradas de los archivos solapados antes de editar y se revisó el diff
contra ellas para distinguir este bloque. Ambos árboles conservan cambios sin commit.
Sin git add, commit, push, migraciones, despliegue ni operaciones remotas.
