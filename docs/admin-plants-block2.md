# Bloque 2 — Plantas e inventario móvil

Implementado y validado localmente en `main`. Detenido para aprobación visual.
Sin cambios de backend, Android, dependencias, migraciones ni producción.

## Experiencia implementada

- El módulo existente de catálogo abre «Plantas»: tarjetas con fotografía,
  código, categoría, precio, existencia de la sucursal y preparación comercial.
- Búsqueda por nombre común/científico, código o barras; categoría, por completar
  y existencias bajas. Filtros en la URL, retorno a la posición de lista y
  secuencia capturada al abrir la ficha.
- Ficha como página dedicada dentro del router existente, no un modal largo.
  Fotografía protagonista, precio y estado claros; botánica y campos avanzados
  en «Más detalles». Código conservado; no se crean productos al guardar.
- Cámara mediante selector de archivo `capture=environment`, o galería sin
  capture; JPEG/PNG/WEBP hasta 5 MiB. Vista previa con URL local revocable.
  Servicio existente normaliza y comprime en el servidor. No se solicitan permisos
  de cámara permanentes ni se agregó una dependencia de imágenes.
- Fotografía independiente de la ficha. Un fallo conserva archivo y formulario,
  permite consultar la fotografía registrada y reintentar explícitamente.
  No se avanza a otra planta con fotografía pendiente.
- PATCH sólo de campos editados: guardar botánica no confirma precio ni cambia
  activación. Precio confirmado según backend; habilitación comercial explícita
  sólo cuando se cumplen los requisitos de 033. Foto/botánica opcionales.
- Conteo separado: referencia de saldo consultada antes de contar, cantidad,
  motivo y sucursal. Observación sin ajuste directo. Recuperación reutiliza el
  diario y la misma clave del bloque 1; no actualiza la referencia al reintentar.
- Propietarios: revisión de conteos por planta, aprobación/rechazo con motivo,
  movimientos y acceso al circuito existente de compras/recepción. Las acciones
  dependen de permisos efectivos del servidor, sin comparar nombres personales.
- «Guardar y siguiente» busca la siguiente pendiente en la secuencia estable,
  conserva filtros y ofrece fin de selección. Protección ante navegación interna,
  regreso y recarga con cambios sin guardar; cerrar sesión/actualizar acceso
  también advierten antes de descartar. Operaciones en curso impiden salir.
- QR reutiliza el diálogo y el formato de impresión existentes. Creación,
  categorías, códigos, activación general y etiquetas en lote siguen disponibles
  en las herramientas de catálogo. No se rediseñó el resto del panel.

## Reutilización y archivos

Servicios de catálogo y carga, parsers, AuthProvider, backendHttp, inventario,
permisos/diario de 033, InventoryCountReview y ProductQrLabelDialog reutilizados.
No se introdujo otra fuente de datos ni modo demo en la aplicación.

Modificados en ViveroWeb:

- `src/features/access/access-rules.ts`: nombre visible «Plantas», mismas capacidades.
- `src/features/admin/AdminPage.tsx`: conexión del módulo, navegación mediante
  router y opciones de sesión compactas en Plantas.
- `src/features/admin/admin-catalog-types.ts` y `admin-catalog-service.ts`:
  conservar/validar la fotografía primaria ya recibida de la API.
- `src/features/admin/InventoryCountReview.tsx`: filtro opcional por planta;
  comportamiento anterior sin filtro conservado.

Nuevos en `src/features/admin/plants/`: `AdminPlants.tsx`, `PlantDetail.tsx`,
`PlantCount.tsx`, `PlantPhoto.tsx`, `usePlants.ts`, `plants-service.ts`,
`plants-model.ts`, `plants.css`, `plants.test.ts`.
También `tests/plants-browser.mjs` y este informe.

## Pruebas ejecutadas

```text
npm run build
npm run lint
npm test -- src/features/admin/plants/plants.test.ts src/features/admin/admin-catalog-api.test.ts src/features/admin/admin-catalog-parser.test.ts src/features/admin/inventory-preparation-service.test.ts src/features/admin/product-qr-label.test.ts
node tests/plants-browser.mjs
git diff --check
```

Para el último comando Node se suministró `BROWSER_TEST_MODULES` apuntando al
runtime Playwright/Sharp ya disponible en esta PC; no se instalaron paquetes.

- Build y lint aprobados; 57 pruebas focalizadas aprobadas en cinco archivos.
- Navegador Chrome real con el bundle compilado y un servidor HTTP exclusivamente
  en loopback. Contratos simulados en memoria con datos sintéticos, sin MariaDB.
- Recorrido aprobado: filtros combinados rápidamente, ficha, edición parcial,
  fotografía independiente, error/reintento conservando botánica, QR, bloqueo
  de navegación y descarte explícito, guardar/siguiente y fin de secuencia lógico.
- Conteo con respuesta truncada después del guardado simulado: resultado
  recuperado con la clave original, una observación y ningún cambio de saldo.
- Gerente sin acciones de recepción/aprobación; propietario revisa y aprueba;
  ficha y listado muestran el saldo actualizado del contrato simulado.
- Sin desbordamiento a 390/768/1024/1440 px; ventana baja de 390×460 permite
  llegar a Guardar. Botón principal >=48 px; texto al 200 % sin desbordamiento.
  Foco visible, etiquetas accesibles y avisos de estado/error.
- No se solicitaron endpoints de ventas, cobros, recepción ni conteo directo.
  Browser y servidor de ensayo cerrados al terminar.

Las pruebas reales MariaDB y autorización transaccional del bloque 1 son evidencia
previa, no pruebas repetidas en este bloque. No se ejecutaron suites masivas,
Android, cámara física, impresora, ni aceptación con cuentas productivas.

## Capturas reales, datos sintéticos

Archivos ignorados en `artifacts/plants-block2/`, generados por la prueba:

1. `01-mobile-list.png` — listado 390 px.
2. `02-mobile-detail.png` — ficha 390 px.
3. `03-mobile-photo-edit.png` — fotografía/edición.
4. `04-mobile-count.png` — conteo.
5. `05-mobile-pending.png` — planta por completar.
6. `06-mobile-owner.png` — revisión de propietarios.
7. `07-tablet-portrait.png` — 768 px.
8. `08-tablet-landscape.png` — 1024 px.
9. `09-desktop.png` — 1440 px.

`results.json` contiene resultados del navegador. Fotografías de ejemplo tomadas
de los activos existentes del proyecto, no fotografías nuevas del vivero.

## Límites y publicación pendiente

- Requiere backend del bloque 1 con migración 033; no publicar esta Web contra
  la API productiva anterior. No se aplicó 033 en producción.
- Cámara/galería y teclado real deben comprobarse en el navegador del celular.
  HEIC/AVIF no forman parte del contrato actual de carga; se informa su rechazo.
- Si se pierde una respuesta de fotografía, consultar la foto registrada antes
  de reintentar. El contrato de imágenes no ofrece clave idempotente: no se
  promete deduplicación de cargas inciertas; no hay reintentos automáticos.
- Formularios/fotos sin guardar quedan en memoria: hay aviso al salir, pero no
  se promete recuperación después de que el navegador o sistema se cierre
  forzosamente. El diario de operaciones de conteo sí permanece persistido.
- Preparación usa el endpoint existente por producto, máximo seis consultas
  paralelas; optimizar listados masivos requeriría otro contrato, no creado aquí.
- Historial de movimientos conserva el contrato existente de los 50 más recientes.

## Control de cambios

ViveroWeb permanece en `main`, HEAD `f208ffb1dabf8db5d740a5c17cab7a09d33236d6`.
ViveroApp permanece en `main`, HEAD `239411caeefc715feb55c9a8fa21163c218a9fde`.
Los cambios previos de bloque 1, POS, ticket, IDE y documentos se conservaron.
La ampliación de InventoryCountReview está identificada arriba; no se alteró su
transacción o recuperación. Ambos árboles siguen con trabajo sin commit.
Sin git add, commit, push, operaciones remotas, despliegue ni bloque 3.
