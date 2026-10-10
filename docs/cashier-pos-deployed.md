# Caja POS publicada — Web exclusivamente

Publicación autorizada por Pedro en Hostinger VPS 2030059 / srv2030059 / 179.236.238.111. Confirmado mediante inventario Hostinger y hostname SSH antes de modificar.

## Resultado verificado

- Imagen activa: `vivero-web-pos:20261010-68f97ea34589`, ID `sha256:02000e02d752abf210db1b59af52fe176f7078b5c38cce0d5968b3ed4cb1454f`.
- Web anterior: `sha256:802b51cf2564621dc3fb125ed86a85ef63bee8ae473a70ce79efa4e3d0681818`, conservada y etiquetada `vivero-web-rollback:20261010-before-pos`.
- Contenedor Web nuevo: `e0a78ac82954e983de48563b4bcc7b56a5ac69239bd4e1a5bda56c34eff5d406`, running, cero reinicios.
- HTTPS de Vivero y Catering 200; /, /login y /caja sirven el HTML aprobado. Los 23 archivos públicos coinciden por SHA-256 con el bundle autorizado, incluido el ticket compacto.
- API y MariaDB saludables. API, MariaDB, proxy y ambos servicios Catering mantuvieron ID, imagen, inicio y reinicios.
- Overlay host, Caddy HTTP y proxy compartido mantuvieron sus hashes; Web conservó exactamente montajes, variables, redes, alias y ausencia de puertos publicados.
- Sustitución de Web y comprobaciones posteriores: 2.33 segundos. No equivale a una medida externa del tiempo exacto de indisponibilidad.
- No se ejecutaron migraciones, compilaciones o suites adicionales, ni se crearon ventas/cobros. Android intacto. Sin commit ni push.

## Configuración activa y recuperación

Se cambió únicamente la referencia `services.web.image` del `images.yaml` vigente en `/srv/apps/vivero-dulcinea/releases/20261010-pilot-239411c/images.yaml`. Las referencias API/migrate conservaron sus bytes. No se movió el enlace `current` ni se alteró la configuración de otros servicios. Se usaron los mismos cuatro archivos Compose del contenedor anterior y proyecto `vivero-vps`; ejecución limitada a `up -d --no-deps --no-build --pull never web`.

Entrega y copia del overlay anterior en `/srv/apps/vivero-dulcinea/releases/20261010-web-pos-68f97ea34589/`: `web-image.tar`, `images.before.yaml`, `web-pos.images.yaml` y `deployment.json`.

Para revertir, confirmar destino y servicios, conservar la referencia actual y cambiar únicamente `services.web.image` del overlay activo al ID anterior. Usar los mismos archivos Compose, entorno compartido y proyecto, y ejecutar únicamente `up -d --no-deps --no-build --pull never web`. Verificar HTTPS y los servicios protegidos. No restaurar bases ni revertir SQL. La copia `images.before.yaml` es evidencia de las referencias anteriores; no restaurarla completa en el futuro si otros servicios hubieran cambiado.

## Pendiente de Pedro

Inicio de sesión autenticado, pendientes/Venta directa según permisos, aceptación visual del ticket compacto e impresión física. HTTP y hashes acreditan entrega del frontend aprobado, no un cobro autenticado ni la impresora.

Evidencia sanitizada local: `artifacts/pos-release/preflight.json`, `stage.json`, `deployment-result.json`, manifiesto e instrucciones del despliegue. El primer guard de ruta se adaptó al enlace productivo documentado hacia `/opt/vivero/releases` antes de reemplazar Web; no hubo discrepancia de servicios ni cambios de proxy.
