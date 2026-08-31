# Tarea activa — Cobrar una venta enviada desde Android

Estado: **lista para ejecutar**.

## Objetivo

Validar el camino principal de Caja con una venta sintética real enviada por ViveroApp, sin ampliar módulos ni realizar endurecimiento general.

## Alcance

1. Usar Supabase local levantado desde ViveroApp.
2. Iniciar sesión con un cajero sintético autorizado.
3. Recibir la venta en la bandeja.
4. Abrir el detalle y comprobar el total autoritativo.
5. Confirmar un cobro.
6. Actualizar la bandeja y recuperar el resultado si aplica.
7. Verificar desde Android el estado final.
8. Registrar solamente los defectos observados.

## Criterios de aceptación

- La venta aparece una sola vez.
- Detalle, folio, partidas y total corresponden a la venta enviada.
- Un doble toque o reintento no duplica el pago.
- La venta cobrada deja de figurar como pendiente.
- Android puede recuperar el estado pagado.
- No se muestran errores internos ni credenciales al usuario.
- Se utilizan exclusivamente datos sintéticos.

## Validación proporcional

- `npm run build`.
- Pruebas unitarias relacionadas con archivos modificados.
- Un recorrido manual completo.
- Ejecutar lint y suite completa si cambia un contrato, un guard, el flujo de cobro o si el checkpoint final lo requiere.

## Fuera de alcance

- Promociones y pedidos reales.
- Rediseño general.
- Refactors no necesarios.
- Despliegue remoto.
- Casos extremos sin evidencia.
- Cambios backend, salvo defecto bloqueante coordinado con ViveroApp.

## Salida

Reporte corto: venta usada, pasos aprobados, defectos encontrados y siguiente corrección mínima.
