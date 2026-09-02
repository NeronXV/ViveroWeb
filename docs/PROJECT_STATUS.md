# Estado actual del proyecto

Última revisión documental: 2026-09-01.

## Objetivo actual

Completar y validar el recorrido operativo del MVP antes de ampliar módulos, cobertura exhaustiva o endurecimiento avanzado.

## Estado comprobable en `main`

- SPA con React 19, TypeScript estricto, React Router y Vite.
- Catálogo público conectado a Supabase.
- Autenticación y contexto de acceso reales.
- Panel interno protegido por capacidades.
- Caja conectada a contratos reales de bandeja, detalle, claim, confirmación y recuperación.
- Administración real de sucursales, personal, productos, clientes, inventario y reportes básicos.
- Inicio interno identificado como panel de trabajador, gerencia o administración; los módulos siguen habilitándose exclusivamente por capacidades del backend.
- Pedidos web conectados a un contrato real de Supabase: carrito público, precios autoritativos, contacto, sucursal, seguimiento administrativo y estados auditados. El pago en línea continúa fuera de alcance.
- Último commit observado al crear este documento: `e1bc0b27f39d17516f0bddaec0f90a9ec554deff`.

## Siguiente resultado demostrable

Participar en una prueba local completa:

1. recibir una venta enviada desde ViveroApp;
2. mostrar detalle y total autoritativos;
3. cobrarla una sola vez;
4. recuperar correctamente un resultado incierto o repetido;
5. reflejar el estado final en Android;
6. comprobar el efecto de inventario definido por el despliegue gradual.

## Bloqueadores que sí detienen el MVP

- La Web no compila o no inicia.
- Caja no recibe, detalla o confirma una venta válida.
- Se duplica un cobro o se usa un total calculado por el navegador.
- Una ruta crítica queda accesible sin sesión o capacidad.
- Se mezclan datos demo con operaciones reales.
- Se expone una credencial sensible.

## Deuda que no bloquea por sí sola

- Cobertura exhaustiva de estados poco probables.
- Refactors no requeridos por el recorrido.
- Optimización sin problema medido.
- Promociones, pago en línea y reportes avanzados.
- Endurecimiento empresarial adicional.

## Mantenimiento

Actualizar cuando cambien el estado funcional, el bloqueo principal o la tarea activa. Conservar el detalle histórico en Git y en la documentación técnica existente.
