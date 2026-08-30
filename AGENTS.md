# AGENTS.md

## Propósito y alcance

- Este repositorio contiene la aplicación web de Vivero Dulcinea.
- Trabaja solo dentro de `ViveroWeb` salvo autorización expresa de Pedro para coordinar otro proyecto.
- Prioriza cambios pequeños, verificables y compatibles con la arquitectura y el diseño existentes.
- Distingue explícitamente las fuentes demostrativas de las fuentes reales del backend; mientras existan datos demo, no los presentes como persistidos ni autoritativos y no los mezcles con contratos reales.

## Mapa del repositorio

- `src/main.tsx`: entrada de React y composición de providers globales.
- `src/app/`: shell, router, utilidades de página y providers de alcance global.
- `src/components/`: componentes compartidos de layout y feedback.
- `src/features/`: funcionalidades por dominio, incluidas catálogo público, auth, acceso, caja y administración.
- `src/lib/supabase/`: validación de entorno y creación del cliente de navegador.
- `src/data/mock/`: contenido y entidades exclusivamente demostrativos.
- `src/types/`: tipos compartidos del dominio de demostración.
- `src/styles/`: sistema visual, estilos base, componentes, tienda, interacción, dashboard y ajustes de la app.
- `src/assets/`: imágenes y recursos visuales importados por la aplicación.
- La raíz contiene la configuración de Vite, TypeScript, ESLint, npm y la documentación general.

## Tecnologías y arquitectura

- La aplicación es una SPA con React 19, TypeScript 5.8 estricto y Vite 7.
- Usa React Router 7 con `createBrowserRouter`, rutas anidadas y carga diferida mediante `lazy` y `Suspense`.
- Usa `@supabase/supabase-js` 2.112 para sesión, autenticación y RPC de contexto de acceso.
- npm y `package-lock.json` son la fuente reproducible de dependencias; no cambies versiones o lockfile sin necesidad explícita.
- Conserva el flujo actual: ruta o componente -> hook/contexto -> servicio -> Supabase o fuente demo local.
- `AuthProvider` es la autoridad de estado de sesión en el cliente; `DemoStoreProvider` encapsula el estado demo persistido en `localStorage`.
- No introduzcas otro router, gestor de estado global, cliente Supabase o sistema de estilos en paralelo.

## Convenciones de React y TypeScript

- Escribe componentes funcionales y hooks idiomáticos, siguiendo el formato del archivo modificado.
- Mantén TypeScript estricto; modela límites con tipos explícitos y valida datos externos recibidos como `unknown`.
- Conserva el estado mutable encapsulado y expón por contextos solo el contrato necesario.
- Evita efectos para estado derivable; usa memoización solo cuando aporte estabilidad o coste medible.
- Limpia suscripciones, temporizadores y operaciones asíncronas en el ciclo de vida correspondiente.
- Evita actualizaciones de estado tras desmontaje y protege respuestas obsoletas de solicitudes concurrentes.
- Coloca páginas y lógica específica dentro de su `feature`; no crees carpetas globales que dupliquen responsabilidades.
- Coloca componentes realmente compartidos en `components`, hooks globales en `app` y acceso técnico común en `lib`.
- Mantén servicios de frontera, parsers, reglas y tipos de acceso separados como en `features/access`.
- No mezcles datos demo con respuestas reales ni presentes una mutación local como operación persistida en backend.

## Estados de interfaz

- Toda carga remota debe representar estados explícitos de carga, contenido, vacío y error cuando apliquen.
- Durante la verificación de sesión o permisos, no renderices anticipadamente contenido protegido.
- Un fallo al cargar acceso conserva la sesión sin conceder permisos y debe ofrecer feedback seguro y reintento cuando proceda.
- Los estados vacíos deben ser comprensibles y no confundirse con fallos de red o autorización.
- Evita mostrar detalles técnicos, payloads o mensajes sensibles de Supabase al usuario; usa errores seguros y accionables.
- Impide operaciones duplicadas mientras una acción de autenticación esté en curso.

## Navegación y protección de acceso

- Declara rutas en `src/app/router.tsx`; no disperses paths protegidos ni destinos de retorno sin validar.
- Conserva los layouts anidados y los fallbacks accesibles de rutas diferidas.
- Las rutas internas requieren, en orden, sesión válida, contexto de acceso válido y capacidades específicas.
- Valida cualquier `returnTo` contra una lista cerrada; nunca permitas redirecciones abiertas.
- Centraliza reglas de entrada y visibilidad en `features/access`; no compares roles de forma ad hoc en páginas.
- Decide acceso por `accessState`, capacidades efectivas y sucursal activa cuando el contrato lo exija.
- Al cambiar de identidad o cerrar sesión, invalida de inmediato el contexto de acceso previo.
- Comprueba que el contexto recibido corresponde al usuario autenticado antes de habilitar contenido.
- La interfaz puede ocultar o deshabilitar acciones por capacidad, pero nunca sustituye RLS, privilegios o validación backend.

## Supabase y contratos compartidos

- `ViveroApp/supabase/migrations` es la autoridad externa de migraciones, RLS, privilegios, RPC y contratos compartidos.
- No crees migraciones, SQL, funciones, políticas, roles ni lógica backend paralela dentro de `ViveroWeb`.
- Consume los contratos autoritativos sin inventar campos, roles, estados, capacidades, nombres RPC ni semántica de errores.
- Conserva la validación estricta del resultado de `get_my_access_context`; rechaza formas desconocidas o incoherentes.
- Si un cambio web necesita modificar el contrato backend, detente y solicita autorización para coordinar el repositorio autoritativo.
- Las reglas críticas de autorización, precios, pagos, ventas e inventario pertenecen al backend, no al navegador.
- No ejecutes comandos de Supabase ni operaciones sobre entornos remotos sin autorización expresa de Pedro.
- Confirma siempre si el destino es local, staging o producción; nunca presupongas un proyecto linked.
- No uses datos, cuentas o identificadores reales en código, fixtures, documentación o pruebas.

## Variables de entorno y credenciales

- El cliente admite únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` según `.env.example`.
- Usa archivos locales ignorados por Git para valores de entorno y conserva marcadores sintéticos en ejemplos versionados.
- Todo valor `VITE_*` puede terminar en el bundle público: nunca incluyas `service_role`, contraseñas, tokens o secretos administrativos.
- Trata los valores de `.env`, `.env.local` y otros archivos reales de entorno como sensibles: no los muestres, registres ni versiones.
- Cuando una tarea autorizada requiera diagnosticar configuración, reporta solamente presencia, tipo de destino y resultado de validación; nunca reproduzcas el valor.
- Mantén la validación actual: remoto por HTTPS en un host Supabase permitido y loopback solo durante desarrollo.
- Verifica configuración y destino por entorno; no reutilices credenciales entre local, staging y producción.

## Diseño y accesibilidad

- Conserva el lenguaje visual, variables CSS, temas, espaciado, componentes y comportamiento responsive existentes.
- Reutiliza estilos y tokens antes de crear variantes; evita estilos globales que alteren pantallas no relacionadas.
- Mantén HTML semántico, labels asociados, navegación por teclado y estados de foco visibles.
- Usa `aria-live`, `role="status"`, `role="alert"` y `aria-busy` para feedback dinámico cuando corresponda.
- Conserva títulos de documento, foco del encabezado al cambiar de contexto y soporte para movimiento reducido.
- Las imágenes informativas necesitan texto alternativo; las decorativas deben tener `alt=""`.

## Flujo obligatorio de trabajo

1. Confirma raíz, rama, HEAD y `git status --short` antes de modificar.
2. Lee estas instrucciones y la evidencia local mínima necesaria; no asumas que documentación antigua sigue vigente.
3. Identifica y preserva todos los cambios preexistentes del usuario.
4. Expón un plan proporcional con archivos, riesgos y validaciones previstos.
5. Implementa el cambio mínimo sin refactors, limpiezas ni correcciones ajenas.
6. Valida primero lo específico y después las comprobaciones amplias justificadas.
7. Revisa el diff completo, ejecuta `git diff --check` y vuelve a consultar el estado.
8. Reporta cambios propios, cambios preexistentes, validaciones, limitaciones y riesgos por separado.

## Validación respaldada por el repositorio

- Lint: `npm run lint`.
- Pruebas unitarias: `npm test`.
- TypeScript y bundle de producción: `npm run build`.
- Desarrollo manual: `npm run dev`; inícialo solo cuando la tarea lo requiera y no lo dejes ejecutándose.
- Vista previa del bundle: `npm run preview`; úsala solo con justificación y autorización para iniciar el servidor.
- Las pruebas Vitest existentes cubren parsers y contratos de frontera; no sustituyen las pruebas integrales contra Supabase.
- No instales dependencias ni regeneres el lockfile salvo solicitud expresa.

## Protección del trabajo y operaciones restringidas

- No reviertas, sobrescribas, formatees ni incluyas cambios ajenos.
- Si el cambio solicitado se solapa con trabajo existente y no puede preservarse, detente y pide dirección.
- No edites artefactos generados, cachés o archivos ignorados para ocultar un estado sucio.
- No uses `git add`, commit, push, pull, merge, rebase ni comandos destructivos sin autorización expresa de Pedro.
- Cualquier publicación, despliegue, operación remota o cambio en otro repositorio requiere autorización expresa de Pedro.
- No inicies Docker, Supabase, navegadores o servicios persistentes salvo que la tarea lo autorice.

## Definición de terminado

- El comportamiento solicitado está implementado con el menor alcance razonable.
- La arquitectura, el diseño, la accesibilidad, los contratos y las fronteras de seguridad se preservan.
- `npm run lint` y `npm run build` pasan cuando aplican, o sus bloqueos quedan documentados con evidencia.
- El diff no contiene secretos, artefactos, cambios accidentales ni archivos fuera de alcance.
- La documentación se actualiza únicamente cuando cambia un comportamiento, contrato o procedimiento duradero.

## Reporte final

- Resume el resultado y enumera los archivos modificados.
- Indica los comandos ejecutados y su resultado; explica pruebas omitidas o bloqueadas.
- Separa claramente cambios preexistentes de los producidos por la tarea.
- Declara riesgos, supuestos, dudas y trabajo deliberadamente fuera de alcance.
- Incluye rama, HEAD y estado Git final.
- Confirma si hubo commit, push, despliegue u operación remota.
