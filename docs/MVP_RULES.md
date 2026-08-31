# Reglas de desarrollo del MVP

## Propósito

Entregar pronto una versión funcional de Vivero Dulcinea manteniendo un piso mínimo de seguridad y consistencia.

## Obligatorio

- Cambiar sólo lo requerido por la tarea activa.
- Comprobar el camino principal afectado.
- Ejecutar compilación y validaciones específicas proporcionales.
- Mantener sesión, capacidades, parsers de frontera y contratos autoritativos.
- Mantener secretos fuera del bundle, logs y Git.
- Separar explícitamente módulos demo y reales.
- Documentar la deuda importante y continuar cuando no sea bloqueante.

## Piso no negociable

- Nunca usar `service_role` ni secretos en el navegador.
- No sustituir RLS o permisos backend con controles visuales.
- No calcular ni confirmar totales de venta como autoridad del cliente.
- Conservar idempotencia y recuperación del cobro.
- Bloquear rutas críticas sin sesión, contexto válido y capacidad.
- No mezclar una mutación local con persistencia real.

## Puede posponerse

- casos extremos no observados;
- cobertura total de combinaciones;
- optimización prematura;
- refactors generales;
- módulos fuera del recorrido;
- endurecimiento empresarial adicional.

## Pruebas proporcionales

- Visual/texto: revisión manual y build si aplica.
- Funcional normal: camino principal, prueba específica y build.
- Caja, permisos o contrato: pruebas específicas, idempotencia/autorización pertinente y suites amplias sólo cuando el riesgo lo justifique.
- Checkpoint de integración: lint, test, build y recorrido Android → Web.

## Hallazgos

- **Bloqueante:** rompe flujo, datos, autorización, secretos o cobro. Corregir ahora.
- **Importante:** afecta el piloto próximo. Programar.
- **Deuda:** mejora futura sin impacto inmediato demostrado. Registrar y continuar.

## Terminado

- criterios de aceptación cumplidos;
- camino principal comprobado;
- sin riesgos bloqueantes conocidos;
- diff limitado y sin secretos;
- estado y siguiente tarea actualizados cuando corresponda.
