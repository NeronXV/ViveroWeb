# Ruta MVP funcional de ViveroWeb

## Fase A — Venta y cobro completos

Estado: **en validación**.

- Acceso del cajero.
- Bandeja de ventas.
- Detalle autoritativo.
- Claim de cobro.
- Confirmación.
- Recuperación idempotente.
- Actualización de bandeja.
- Confirmación visible desde Android.

Criterio de salida: una venta sintética recorre Android y Web sin intervención manual en la base de datos.

## Fase B — Administración diaria mínima

Estado: **parcialmente implementada**.

- Sucursales y personal.
- Catálogo y fotografías.
- Clientes básicos.
- Recepción, conteo e historial de inventario.
- Reportes básicos.
- Pedidos reales desde el catálogo público con seguimiento por sucursal.

Criterio de salida: un responsable prepara una sucursal y su catálogo para operar un piloto.

## Fase C — Piloto

Estado: **pendiente**.

- Configurar un entorno de prueba.
- Cargar datos mínimos.
- Ejecutar tareas reales controladas.
- Priorizar la retroalimentación por frecuencia e impacto.

## Fase D — Estabilización

Estado: **pendiente**.

- Corregir defectos observados.
- Añadir pruebas de regresión específicas.
- Mejorar mensajes y recuperación donde exista fricción.
- Revisar permisos y consistencia del recorrido completo.

## Fase E — Expansión

Estado: **pospuesta**.

- Promociones reales.
- Pago en línea y entrega de pedidos.
- Reportes avanzados.
- Fidelidad.
- Escalabilidad y endurecimiento adicional.

## Prioridad

1. recorrido bloqueado;
2. cobro, datos, autorización o secretos;
3. fricción frecuente;
4. deuda que ya impide avanzar;
5. mejora opcional.
