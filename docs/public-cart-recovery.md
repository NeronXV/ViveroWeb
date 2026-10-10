# Recuperación del carrito público

## Corrección local del 10 de octubre de 2026

El servicio distinguía el envío del pedido y la obtención de su comprobante sólo parcialmente. Un fallo de `/ticket` después de una respuesta de aceptación se convertía en `INCOMPATIBLE_RESPONSE` durante el envío. Durante la recuperación, un `WEB_ORDER_NOT_FOUND` procedente del comprobante podía activar el reenvío aunque `/recover` ya hubiera confirmado el pedido. El servidor protegía ese reenvío mediante la misma clave, pero el cliente ocultaba la etapa que falló.

La corrección separa la validación de la aceptación de la lectura del comprobante. Un fallo de este último produce `TICKET_UNAVAILABLE`, conserva el intento y nunca activa el reenvío. Los errores conocidos de contacto, conexión, acceso, procesamiento y folio reciben mensajes específicos y seguros. Los mensajes arbitrarios del servidor no se muestran.

No cambia el contrato de almacenamiento, la clave, el contenido del intento, el bloqueo entre pestañas ni la API. El intento se elimina sólo después de verificar el resultado original y guardar el comprobante. Un 404 de la consulta inicial permite reenviar exclusivamente el mismo cuerpo y clave; un 404 del comprobante no lo permite. Un rechazo o resultado incierto conserva el intento y bloquea otro pedido.

## Archivos y verificación

- `src/features/public-orders/backend-order-service.ts`: separación de etapas y mensajes.
- `src/features/public-catalog/CartDrawer.tsx`: indicaciones de atención segura.
- `src/features/public-orders/backend-order-service.test.ts` y `public-order-ticket.test.tsx`: regresiones sintéticas.

Ejecutado: pruebas focalizadas de servicio, coordinador y comprobante, 23 aprobadas; `npm run build`; ESLint de los cuatro archivos afectados; `git diff --check`.

Las pruebas usan respuestas sintéticas y almacenamiento aislado en memoria. Cubren éxito, respuesta perdida, conservación tras recargar, reenvío con la misma clave, bloqueo de claves nuevas y fallo del comprobante sin otro POST de pedido. No se ejecutaron pruebas de escritura contra MariaDB ni ventas o pedidos de prueba en producción. Estas pruebas verifican el comportamiento del cliente; no sustituyen una prueba integral de concurrencia de MariaDB.

## Límite de diagnóstico y publicación

La inspección remota fue de lectura. Los endpoints públicos de recuperación no requieren login; el servicio publicado y los contratos existentes respondieron correctamente durante la revisión. La evidencia técnica sanitizada se conserva temporalmente en `ViveroApp/tmp/cart-recovery-20261010/`.

No se identificó la clave del intento del dispositivo reportado ni se confirmó qué respuesta recibió ese navegador. Por eso la corrección local no se presenta como solución confirmada de ese caso y no se publicó. No se cancelaron pedidos ni se borró almacenamiento. No se modificaron API, Android, migraciones, inventario, catalogación ni Catering Oculto.

Para continuar hace falta identificar la etapa que falla en ese dispositivo: ruta `/recover`, `/ticket` o `/web-orders`, estado HTTP y código `error`, o ausencia de respuesta por un fallo de conexión. No compartir encabezados, claves de recuperación, contacto ni el cuerpo del pedido. Si se confirma una corrección aplicable, verificar el respaldo recuperable, conservar la imagen Web anterior, realizar las pruebas integrales necesarias y publicar únicamente el servicio afectado.
