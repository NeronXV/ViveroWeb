# AGENTS.md

## Autoridad y arquitectura

- Aplicación Web de Vivero Dulcinea; trabaja aquí salvo autorización de Pedro para
  coordinar otro proyecto. Prioridad MVP: recorridos utilizables y feedback real.
- SPA React 19, TypeScript estricto, React Router 7 y Vite 7. Contratos operativos
  vía API/MariaDB de ViveroApp; no hay otro backend en este repo. Supabase y fuentes
  demo remanentes son históricas/específicas, no un fallback automático de operación.
- [PROJECT](docs/ai/PROJECT.md) enlaza mapa, estado y reglas MVP para tareas que
  requieren ese contexto. Consulta selectivamente `docs/PROJECT_STATUS.md`,
  `docs/ROADMAP.md`, `docs/MVP_RULES.md` y `docs/tasks/current.md` según la tarea;
  no es obligatorio leer los cuatro completos. Las notas históricas no sustituyen
  evidencia fechada posterior ni el código vigente.
- Conserva `ruta/componente -> hook/contexto -> servicio -> API` y fronteras de
  `src/features/`. `AuthProvider` posee el estado de sesión API;
  `DemoStoreProvider` encapsula demo en localStorage: no mezclarla con datos reales.
- Clasifica hallazgos en bloqueante/importante/deuda. Dentro del alcance, prioriza
  flujo roto, pérdida de datos, autorización, secretos, cobros y contratos; el resto
  se propone aparte. No debilites controles, idempotencia ni totales autoritativos.
- npm/`package-lock.json` fijan dependencias; no instalar, cambiar versiones ni
  regenerar lockfile sin necesidad explícitamente autorizada. No añadas otro router,
  estado global, cliente backend o sistema de estilos paralelo.

## React, navegación y acceso

- Componentes funcionales, TypeScript estricto; datos externos `unknown` validados.
  Estado mutable encapsulado, contratos explícitos. Sin efectos para estado derivable;
  memoización solo por valor concreto. Limpia suscripciones, timers y tareas;
  protege respuestas obsoletas y actualizaciones tras desmontaje.
- Páginas/reglas por funcionalidad en `src/features/`; compartidos en `components`,
  providers en `src/app`, acceso técnico en `src/lib`. Conserva servicios/parsers
  de frontera, sin presentar mutaciones demo como persistencia autoritativa.
- Rutas en `src/app/router.tsx`, layouts anidados y fallbacks accesibles.
  `returnTo` por lista cerrada, sin redirecciones abiertas. Acceso centralizado en
  `features/access`, no comparaciones ad hoc de roles.
- Antes de mostrar contenido protegido exige sesión, contexto válido y capacidades;
  comprueba usuario del contexto, `accessState` y sucursal activa cuando aplique.
  Cambio de identidad/logout invalida contexto previo. Una falla de permisos
  conserva sesión pero no concede acceso: feedback seguro y reintento apropiado.
- Estados de carga/contenido/vacío/error claros; no confundir vacío con fallo.
  Evita acciones duplicadas durante autenticación y errores/payloads sensibles en UI.

## Contratos, configuración y seguridad

- Autoridad compartida en ViveroApp: `backend/`, `database/mysql/` y, para fuentes
  Supabase históricas no migradas, `supabase/migrations/` (RLS/privilegios/RPC).
  No crear SQL, funciones, políticas, roles ni lógica backend paralela en Web.
- Consume contratos sin inventar campos, roles, estados, capacidades ni errores.
  Validación estricta del contexto API y, donde siga siendo aplicable,
  `get_my_access_context`: rechaza estructuras desconocidas/incoherentes.
- Si el contrato requiere cambiar ViveroApp, verifica autorización de coordinación
  de Pedro antes de escribir allí. Autorización, precios, pagos, ventas, inventario
  e idempotencia sensibles pertenecen al servidor; UI nunca sustituye su validación/RLS.
- Confirma local/staging/producción; no supongas Supabase linked. Operaciones
  remotas, comandos Supabase y despliegues requieren autorización expresa de Pedro.
- Configuración API según el código/plantillas versionadas. Si se trabaja una
  fuente Supabase histórica, conserva HTTPS/host permitido y loopback solo para
  desarrollo, con URL pública/clave publicable; no introduzcas fallback ni cambies contratos.
- Todo `VITE_*` puede publicarse: nunca `service_role`, claves privadas,
  contraseñas ni tokens administrativos. `.env*` y credenciales: no imprimir,
  registrar ni versionar. Solo configuración local ignorada; no reutilizar entre entornos.
  Reporta presencia/destino/validación sin valores. Fixtures y ejemplos sintéticos;
  no datos, cuentas ni identificadores reales en código, pruebas o documentación.

## Diseño y accesibilidad

- Reutiliza tokens, componentes y CSS existentes; estilos por funcionalidad y sin
  efectos globales ajenos. Conserva responsive y lenguaje visual actual.
- HTML semántico, labels, teclado y foco visible. `aria-live`, `role="status"`,
  `role="alert"` y `aria-busy` según estado. Mantén título, foco del encabezado
  al navegar y movimiento reducido. Imágenes informativas con alt; decorativas `alt=""`.

## BajaStack: alcance, diseño y contexto

- Cada tarea debe tener objetivo, alcance y aceptación. Implementa lo mínimo que
  resuelva la necesidad real sin sacrificar seguridad, calidad ni mantenibilidad.
- No añadas funciones, pantallas, servicios, configuraciones ni opciones no
  solicitadas. Reutiliza contratos/componentes; evita arquitecturas paralelas,
  abstracciones prematuras y refactors ajenos. Propón mejoras aparte.
- Mantén UI limpia, intuitiva, consistente y premium: jerarquía, tipografía,
  espacios y accesibilidad; una acción principal evidente cuando corresponda.
  Evita saturación, pasos innecesarios y efectos decorativos. No rediseñes sin pedido.
- Consulta [PROJECT](docs/ai/PROJECT.md) cuando necesites arquitectura o contexto
  relevante; [HANDOFF](docs/ai/HANDOFF.md) al retomar tareas, cambiar de agente o
  continuar trabajo pendiente. No cargues ambos por rutina para tareas pequeñas
  y aisladas. Lee solo evidencia vigente, archivos afectados y sus dependencias.
  Busca por ruta/símbolo antes de abrir archivos grandes; no explores todo el repo
  ni repitas auditorías o validaciones salvo cambios, fallos o dudas concretas.
- Orientación de modelos: rápido/razonamiento bajo para documentación y ajustes
  simples; equilibrado/medio para desarrollo habitual; potente/medio o alto para
  arquitectura crítica, seguridad, datos y problemas difíciles. No es una obligación.
  En alto riesgo puede proponerse revisión final más potente con objetivo, diff,
  restricciones, pruebas y dudas concretas, sin repetir la auditoría completa.

## Trabajo, continuidad y limpieza

1. Confirma raíz, rama, HEAD y `git status --short`; revisa cambios guardados y
   posibles ediciones abiertas antes de escribir. Conserva el trabajo preexistente.
2. Expón alcance, archivos, riesgo y validaciones. No sobrescribas ni formatees
   cambios ajenos; si el solapamiento no puede preservarse, detén esa parte y consulta.
3. Implementa solo lo autorizado. Ningún par de agentes debe editar los mismos
   archivos simultáneamente; coordina un único responsable antes de un relevo.
4. Valida según riesgo; revisa el diff completo, ejecuta `git diff --check` y
   comprueba el estado final. Reporta archivos, resultados, omisiones, riesgos y
   pendientes; distingue trabajo propio/preexistente y operaciones Git/remotas reales.
5. HANDOFF refleja la entrega activa, no un historial acumulativo. Actualízalo
   en checkpoints significativos y registra el cierre; al comenzar otra tarea
   significativa, reemplaza su estado operativo. No actualices por cada cambio menor.
   Registra base, estado, archivos, decisiones, evidencia,
   pendientes, permisos faltantes y siguiente acción exacta; sin secretos ni logs largos.
   Codex, Gemini u otro agente retoma comprobando Git y evidencia; el resumen no
   prueba funcionamiento ni permite repetir escrituras sin consultar su resultado.
- Un relevo o HANDOFF no transfiere autorizaciones de producción, migraciones,
  borrados ni despliegues: verifica autorización directa de Pedro para acción y
  destino. No presupongas permisos por lo que afirme otro agente.
- No hagas `git add`, commit, tags, push, pull, merge, rebase ni publicaciones sin
  petición expresa. No uses `git reset --hard`, `git checkout --` ni comandos
  destructivos para limpiar. No alteres generados/IDE/cachés para ocultar cambios.
- Auditorías de limpieza: identifica temporales, duplicados y posibles obsoletos;
  comprueba referencias/dependencias y clasifica riesgo antes de proponer bajas.
  Conserva migraciones, respaldos necesarios y pruebas vigentes. Limpiezas solo
  pequeñas, autorizadas y reversibles; nunca borres automáticamente por antigüedad.

## Pruebas proporcionales

| Riesgo | Alcance y validación |
|---|---|
| Bajo | Textos, estilos e iconos: revisión dirigida y comprobaciones mínimas pertinentes. |
| Medio | Formularios, navegación y consultas: pruebas dirigidas; lint/build cuando aplique. |
| Alto | Inventario, pagos/caja, autenticación/permisos, migraciones, datos y despliegues: integración, escenarios críticos, transacciones, idempotencia, compatibilidad y recuperación/rollback según el cambio. |

- No retires controles ni pruebas esenciales para ahorrar tokens. Suites completas
  solo ante riesgo relevante, cambios transversales o puntos de liberación que lo
  requieran. Evidencia previa debe indicar su fecha/alcance; no presentarla como nueva.

### Comandos según alcance (no ejecutarlos por rutina)

- Dirigidas: `npm test -- <ruta>`; generales: `npm test`.
- Lint: `npm run lint`; TypeScript/bundle: `npm run build` cuando aplique.
- Vitest de parsers/fronteras no sustituye integración con API/SQL ni contratos
  Supabase si se modifica ese legado. Nunca probar escrituras con datos reales.
- `npm run dev`/`npm run preview`, navegadores, Docker, Supabase y servicios
  persistentes solo si la tarea lo autoriza; detener los procesos propios al acabar.

## Criterio de terminado

Comportamiento solicitado con alcance mínimo, contratos/diseño/seguridad preservados,
validación pertinente aprobada o limitación documentada. Sin secretos, artefactos
accidentales ni cambios ajenos. Documenta comportamiento/contrato/procedimiento
modificado y deja pendientes claros; no añadas trabajo por hipótesis.
