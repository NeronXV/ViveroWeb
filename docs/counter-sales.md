# Venta de mostrador en Caja web

En Caja, pulsa **Nueva venta de mostrador**. Primero termina o cierra el ticket actual si existe un cobro en curso.

1. Busca por nombre (hasta 20 resultados por consulta), o selecciona Código / lector QR. El lector debe enviar el código como teclado y terminar con Enter. No se incorpora cámara web.
2. Agrega productos y ajusta cantidades; escanear el mismo producto suma una unidad.
3. Opcionalmente busca un cliente existente. Sin selección, la venta es de público general.
4. Pulsa **Continuar al cobro**. El servidor fija precios y promociones; el total del carrito solo es una estimación.
5. Se abre el ticket existente de Caja. Revisa el total definitivo, toma la venta y confirma el pago con el procedimiento normal.

## Acceso y contratos
Requiere una sucursal activa y las capacidades OPERATE_CASHIER, CREATE_SALES y VIEW_CATALOG. OWNER, ADMIN y MANAGER las tienen en el esquema actual. El rol CASHIER no recibe CREATE_SALES automáticamente por esta entrega.

Se reutilizan submit_sale_to_cashier, get_product_by_scan_code, search_customers y la lectura del catálogo protegida. No hay nuevas migraciones, reglas de precio, pagos bancarios ni cambios de permisos. El despliegue debe tener aplicada la migración existente 202609010003_product_scan_lookup.sql; los precios del envío usan el contrato vigente de promociones. No se aplicaron migraciones ni se consultó producción durante esta tarea.

## Recuperación
Antes de enviar, se guarda el identificador y payload en este navegador, separados por usuario y sucursal. Un fallo incierto conserva el mismo intento; al volver a abrir Nueva venta aparece Recuperar venta y abrir cobro. No borres los datos del navegador ni prepares otra venta por el mismo carrito hasta comprobarlo. Se usa Web Locks para coordinar envíos entre pestañas.

El carrito que todavía no se envió vive solo en la pantalla; Cerrar / descartar carrito lo descarta. El navegador avisa al recargar si hay partidas sin enviar.

## Límites y validación
Hasta 100 productos distintos y cantidades enteras de 1 a 100000 por partida, compatibles con el contrato del servidor. El stock se descuenta y valida al cobrar según la activación por sucursal.

Las pruebas locales cubren payload sin precios, cantidades, códigos, respuesta de otra venta/sucursal, totales autoritativos, conservación de identificador después de fallos y bloqueo de envíos cuando no se puede guardar la recuperación. El pago usa el flujo ya existente; la prueba con Supabase y lector físico en la sucursal sigue pendiente. No se inició Docker ni se envió un cobro real.
