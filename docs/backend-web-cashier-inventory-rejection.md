# Rechazo de cobro por inventario insuficiente

Verificado y publicado en el VPS el 2026-10-03. Esta continuación corrige el
mensaje y la clasificación Web de un rechazo autoritativo por inventario.
No modifica contratos MariaDB, cantidades, reservas ni pagos desde herramientas.

## Comportamiento

Antes, `INVENTORY_INSUFFICIENT` no tenía un mensaje específico y el hook
clasificaba el rechazo como `UNCERTAIN`. La pantalla además afirmaba que se
había perdido la comunicación, aunque el servidor había rechazado la operación.

Ahora la frontera conserva el estado HTTP. Solo un `409 INVENTORY_INSUFFICIENT`
devuelve el intento a `CLAIMED`, con el mensaje de falta de existencias y el cuerpo,
clave, método, cantidad recibida y reserva originales. No se envía otra solicitud
ni se genera otra clave. El formulario conserva el bloqueo de los datos originales.
Los fallos de red, respuestas incompatibles y fallos del servidor siguen requiriendo
conciliación. El texto general de incertidumbre no presupone una causa de red.

La corrección no rellena inventario ni convierte intentos persistidos anteriormente
en cobros rechazados: esos intentos todavía deben consultar el resultado del
servidor. Si la reserva ya venció, el flujo de conciliación puede quedar no
disponible y requerir revisión/cierre seguro antes de generar otro intento.
No borrar localStorage ni reemplazar la clave para sortearlo.

## Validación y publicación

- 34 pruebas específicas de servicio/estado de caja, correctas. Incluyen rechazo
  por stock, persistencia del cuerpo/clave y ausencia de reenvío automático.
- Suite Web completa: 471 pruebas aprobadas, 44 archivos. Lint y build correctos.
- Baselines de los siete archivos modificados comparados por SHA-256 con las
  fuentes del VPS antes de reemplazarlas: coinciden. Los cambios previos se preservan.
- Respaldo operativo completo existente: hashes de SQL e imágenes verificados
  antes de recrear Web. No hubo nueva copia, pausa de API ni ensayo de restauración.
- Fuentes Web anteriores e imagen para reversión conservadas en mantenimiento.
  Solo se construyó y recreó Web. HTTPS y Caddy correctos; IDs de contenedores
  API/MariaDB sin cambios y mismos montajes persistentes de Web.
- Los 13 archivos JavaScript/CSS desplegados coinciden con el build local probado.
- Auditoría final de la venta revisada: sigue pendiente de caja, sin pago ni
  movimiento de stock. No se intentó cobrar ni se modificó su reserva.

La consulta diagnóstica inicial mediante POST fue rechazada por la revisión
automática por riesgo de alterar una reserva. No se ejecutó; se sustituyó por
SELECT de solo lectura. No queda una operación diagnóstica bloqueada pendiente
de autorización.

## Archivos propios y estado Git

En `src/features/cashier/`:

- `backend-cashier-service.ts`: mensaje específico del rechazo.
- `cashier-service.ts`: conserva HTTP status en errores de frontera.
- `cashier-payment-state.ts`: clasifica el rechazo manteniendo el intento.
- `useCashierPaymentAttempt.ts`: aplica esa clasificación.
- `CashierPage.tsx`: texto de incertidumbre sin atribuirla siempre a la red.
- `backend-cashier-service.test.ts`: regresión de solicitud única/rechazo.
- `cashier-payment.test.ts`: persistencia e incertidumbre segura.

Además, este documento y un enlace en la guía de corte del repositorio autoritativo.
Copias iniciales/scripts/artefactos en `ViveroApp/tmp/cashier-stock-fix/`, ignorado.
Rama Web `main`, HEAD d4db2b666e4d726d2887d133e64fa34794535ef6. Sin commit ni push;
hubo despliegue Web autorizado dentro de la aceptación y corrección de fallos.
Los cambios preexistentes de ambos repositorios se conservaron.
