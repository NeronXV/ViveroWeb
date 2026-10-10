# Pulido premium final del panel — 10 de octubre de 2026

Ajustes locales sobre los bloques 1–3 aprobados. Detenido para aprobación final.

- Encabezado y navegación más compactos, controles táctiles de al menos 48 px.
  Se conservan Plantas, Recepción, Ventas y Administración según permisos.
- Nombres «Inventario», «Ver QR» y «Herramientas». Las herramientas del catálogo
  se identifican por separado. No se repite el módulo abierto en los enlaces
  secundarios, ni se muestra un desplegable vacío.
- Fichas y filtros con menos espacio vertical, fotografía protagonista,
  existencias alineadas y «Guardar y siguiente» como acción principal.
- Plantas pendientes resaltadas con borde y estado cálidos, sin confundirlas
  con plantas voluntariamente inactivas.
- Conteos con tarjetas más compactas, cantidades y diferencia visibles, y
  «Revisar conteo» destacado. Sin cambios de aprobación, auditoría o recuperación.
- Ajustes CSS limitados al panel existente, sin dependencias nuevas.

## Archivos modificados en esta intervención

- `src/features/admin/AdminPage.tsx`: encabezado y presentación de sesión.
- `src/features/admin/AdminNavigation.tsx`: nombres y eliminación de accesos duplicados.
- `src/features/admin/admin-navigation.css`: refinamiento visual responsive.
- `src/features/access/admin-navigation.ts`: únicamente etiqueta «Inventario».
- `src/features/access/admin-navigation.test.ts`: dos pruebas de presentación.
- `src/features/admin/plants/AdminPlants.tsx`: estado visual y nombre de herramientas.
- `src/features/admin/plants/PlantDetail.tsx`: nombres de QR/historial.
- `src/features/admin/InventoryCountReview.tsx`: énfasis visual del botón de revisión.
- `tests/plants-browser.mjs`: selectores actualizados y salida separada para las capturas.
- Este informe.

## Validación

`npm run build` y `npm run lint`: aprobados.

`npm test -- src/features/access/admin-navigation.test.ts src/features/admin/plants/plants.test.ts`:
17 pruebas aprobadas en dos archivos, sin suites ajenas al cambio.

`node tests/plants-browser.mjs`: recorrido aprobado con Chrome real sobre el
bundle compilado, exclusivamente en loopback y con contratos sintéticos en memoria.
Se usó el runtime Playwright/Sharp existente mediante `BROWSER_TEST_MODULES`.
Navegación, filtros, permisos visibles, edición parcial, foto/reintento, QR,
guardar/siguiente, protección del formulario y recuperación del conteo conservados.
Sin desbordamiento a 390/768/1024/1440 px ni con texto al 200 %; ventana corta y
áreas táctiles comprobadas. Servidor y navegador cerrados al terminar.

`git diff --check`: aprobado. Diff revisado contra copias locales previas de los
archivos solapados, guardadas fuera de Git en `artifacts/admin-polish/before/`.

## Capturas y límites

[Galería de las cuatro capturas solicitadas](../artifacts/admin-polish/gallery.html):
gerente móvil, ficha móvil, propietario móvil y panel de escritorio.
Capturas reales identificadas como ensayo con datos sintéticos. Evidencia JSON
y capturas adicionales responsive en `artifacts/admin-polish/`; evidencia de
los bloques anteriores conservada.

No son pruebas nuevas de persistencia MariaDB ni aceptación de cámara/teclado
físicos. Los límites de recuperación de fotografías del bloque 2 se mantienen.
La futura publicación conjunta necesita el backend aprobado y la migración 033;
no se modificaron ni aplicaron en esta intervención.

Se conservó el trabajo previo sin commit. ViveroWeb permanece en `main`, HEAD
`f208ffb1dabf8db5d740a5c17cab7a09d33236d6`. Sin cambios de permisos, API,
inventario, pagos, migración 033 o Android. Sin producción, commit, push o despliegue.
