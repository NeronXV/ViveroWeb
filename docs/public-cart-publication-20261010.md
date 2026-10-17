# Carrito publicado y preparación de Caja — 10 de octubre de 2026

Publicación completada exclusivamente en Web de Vivero Dulcinea. Versión `20261010-cart-70e454e6c128`, basada en `7227f3baeadbb8bdad191d2160db386cd05cc2b6`. HEAD local permanece en `ae546290654aeda2be13c2fb289a236667714a3b`; su diferencia respecto al commit utilizado es únicamente documentación.

## Alcance comprobado

El candidato se extrajo de Git a un directorio aislado. Frente a las fuentes de la entrega productiva `20261010-navigation-4488b9dc39b5`, cambian funcionalmente solo `CartDrawer.tsx` y `backend-order-service.ts`. `AdminPage.tsx` difiere únicamente por una línea vacía final retirada al organizar Git. Las fuentes de navegación, dependencias, configuración de build y estilos se conservan.

No se incluyó `tests/plants-browser.mjs` ni configuración local, temporales, respaldos o archivos sensibles. La clave, cuerpo persistido, exclusión entre pestañas y contrato API del pedido permanecen iguales. Un fallo del comprobante posterior a la aceptación conserva el intento como `TICKET_UNAVAILABLE` y no autoriza otro POST de pedido. Un error HTTP conocido recibe su mensaje seguro; un resultado incierto se conserva.

## Validación nueva

- Lint y build del candidato aprobado.
- 314 pruebas sintéticas aprobadas en 30 archivos: pedidos, coordinador, comprobantes, catálogo público, Caja, navegación, Sucursales y plantas. Incluyen las regresiones de conservación del intento y no reenvío ante 404 del comprobante.
- 23 comprobaciones de navegador real sobre el bundle candidato en loopback: navegación, rutas, permisos, Sucursales, Caja y tamaños móviles/escritorio. Cero escrituras comerciales.
- 18 verificaciones de contratos de pedidos existentes con los parsers del candidato y código API publicado, dentro de transacción de solo lectura. No se compartieron contactos, claves ni cuerpos de pedido.
- Tras publicar: lecturas de Caja para tres cuentas propietarias activas, cinco ventas pendientes únicas y ocho comprobantes históricos; consultas de existencias de sus sucursales con cantidades válidas. No se crearon claims ni se confirmaron pagos. Esta comprobación usa servicios y parsers; no acredita una sesión humana autenticada en el navegador.
- Catálogo público por HTTPS GET: 15 productos y dos categorías; precios efectivos válidos en centavos enteros.
- El esquema sigue en 034 y continúan 174 borradores. Los conteos agregados de pedidos pendientes, pagos e inventario coinciden antes y después. No se ejecutaron ventas ni pedidos ficticios en producción.

## Respaldo y rollback

Se verificó nuevamente el SHA-256 del respaldo productivo recuperable de esquema 034:

`/var/backups/vivero/vivero-2026-10-10T20-24-15-086Z-0c12968f-b593-4c42-a372-c5188eafcc72-verified-complete-recovery.tar.gz`

Hash: `d7a1ec9d4f83b742356820d1f4093920eb46a593ad6450871411ae2981efb6f2`. La copia externa cifrada volvió a pasar descifrado autenticado íntegro en memoria, sin escribir SQL descifrado. Su restauración completa anterior comprobó 65 tablas y 120 claves foráneas; no se repitió una restauración en esta sesión.

Ese respaldo precede la precarga de los 174 borradores y no se presenta como una instantánea actualizada de sus avances. El rollback de esta entrega es exclusivamente Web; no requiere ni autoriza restaurar MariaDB. Se conserva el volumen productivo actual.

- Imagen anterior: `sha256:38f93f0a2bebaf308e6aa75b27148b85e1cf102606e770268565aa7a87f95d19`.
- Imagen nueva: `sha256:47688a4acf8a68140cc6f2547d3db97a5d6a59b50da6753e76cc96c25f993867`.
- Etiqueta nueva: `vivero-web-cart:20261010-cart-70e454e6c128`.
- Entrega: `/srv/apps/vivero-dulcinea/releases/20261010-cart-70e454e6c128`.
- Imagen anterior exportada a `web-before.tar`, hash `304d501bcfd75562e747ee5cca0bb620bfa5a146e7c5e2bc36c0617f2931a434`.
- Overlay de reversión conservado: `rollback.web.yaml`. Confirmar destino y Compose efectivos antes de cualquier reversión autorizada; agregar ese overlay al final y ejecutar únicamente `up -d --no-deps --no-build --pull never web`. No revertir SQL ni cambiar `current`.

La imagen se construyó en el VPS sobre la imagen activa comprobada por ID, sin pull ni red. Conserva los assets anteriores para sesiones abiertas. Compose efectivo difiere solo en la imagen Web. La primera publicación activó rollback porque el verificador comparaba el orden del arreglo de variables de entorno de Docker. La inspección confirmó valores, montajes, redes y configuración iguales; se normalizó el orden en el helper de entrega y el segundo intento pasó. No se cambió código funcional para resolverlo.

## Estado posterior

HTTPS 200 en `/`, `/health`, `/login`, `/catalogo`, `/caja` y las rutas administrativas de plantas, existencias y Sucursales. Endpoints de identidad, Caja, comprobantes, catalogación e inventario devuelven 401 sin sesión. Los 24 archivos del candidato y los assets anteriores —52 archivos en total— coinciden por hash mediante HTTPS.

API y MariaDB saludables. API, MariaDB, proxy compartido y ambos contenedores de Catering conservaron IDs, imágenes, inicios, reinicios y configuración. Catering `/health/ready` devuelve 200. No hubo cambios de migraciones, permisos, inventario ni información comercial.

Los roles OWNER y CASHIER conservan `OPERATE_CASHIER`. Hay tres cuentas propietarias activas y ninguna cuenta activa con rol CASHIER. Se puede validar Caja con un propietario autorizado; preparar o activar una cuenta dedicada de cajero requiere una tarea y autorización separadas. No se modificaron cuentas.

## Primera venta real

1. Iniciar sesión en `/caja` con la cuenta que operará, comprobar sucursal, permisos y ventas pendientes; no cobrar una pendiente solo para ensayar.
2. Elegir el producto de una venta real y verificar código, cantidad, precio/promoción y disponibilidad. Android 1.0.11 continúa en consulta; usar Venta directa de Caja o el recorrido Web autorizado.
3. Revisar el total autoritativo y confirmar una sola vez el pago realmente recibido. Si hay pérdida de respuesta, comprobar o recuperar el mismo intento antes de recibir dinero o cobrar de nuevo.
4. Verificar un único folio/pago, salida de pendientes, comprobante, impresión real y reimpresión del mismo comprobante. Confirmar que el inventario cambió únicamente por esa venta cuando el control de existencias de la sucursal esté habilitado.
5. Comprobar lector e impresora físicos y el cierre de caja al finalizar la jornada. Estas comprobaciones humanas permanecen pendientes.

## Comprobación del carrito desde celular

Abrir `https://viverodulcinea.bajastack.network/catalogo` en el navegador habitual y recargar con conexión estable. No borrar los datos del navegador. Si existe un intento pendiente, usar **Recuperar o reenviar pedido original**; no enviar uno nuevo desde otro dispositivo.

Si aparece **pedido confirmado, comprobante pendiente**, recuperar el mismo intento. Para la primera compra real, confirmar una vez y comprobar folio, productos y total. Si falla, comunicar hora, mensaje y ruta; no compartir claves, encabezados ni datos de contacto por el chat técnico. La corrección de dos defectos confirmados no acredita retrospectivamente la causa exacta del incidente del dispositivo que fue limpiado.

Evidencia sanitizada de esta entrega: `artifacts/cart-publication-20261010/`, ignorada por Git. Este informe es el único archivo de documentación nuevo; no se hicieron commits ni push en esta sesión de publicación. Se preservaron los pendientes locales del IDE en ViveroApp y el script antiguo de plantas en ViveroWeb.
