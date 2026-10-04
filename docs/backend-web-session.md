# Sesión Web para Backend API

## Estado vigente de integración (2026-10-01)

El AuthProvider existente y el formulario de login ya usan exclusivamente Backend API. La sesión está en memoria; no se restaura una sesión Supabase. Los módulos todavía no migrados requieren integración antes del uso operativo.

Validación de esta sesión: Web 451 pruebas correctas, build/lint correctos;
backend Docker 23 pruebas SQL/HTTP correctas. No hubo prueba visual completa
en navegador, pruebas de dispositivo ni importación real.

## Evidencia anterior

Las referencias siguientes a integración pendiente y uso de Supabase describen
el estado anterior; quedan sustituidas por el estado vigente de arriba.

Estado actual (2026-10-01): el ciclo de sesión API está integrado como ackend en el único AuthProvider. No se activó en el formulario o en Caja. Los módulos visibles siguen Supabase; no se mezclan sus UUID, tokens ni permisos con la API. La descripción original del servicio se conserva debajo como evidencia histórica.

## Servicio inicial

Implementado el 2026-10-01 en `src/features/auth/backend-auth-service.ts`, dentro
de la funcionalidad existente. No añade providers, almacenamiento de tokens,
dependencias ni selectores de backend. AuthProvider y los servicios operativos
actuales todavía usan Supabase. El servicio nuevo está probado, pero aún no está
invocado por la interfaz y no aparece en el bundle de producción.

Contrato: `createBackendAuthService()` ofrece login, context y logout contra
`/api/v1/auth/login`, `/me` y `/logout`, mediante el proxy del mismo origen.
Conserva contraseña sin recortar, token opaco Bearer y duración de 3600 segundos.
El contexto conserva IDs enteros; no los convierte a UUID ni al contrato anterior
de Supabase. Valida versión, campos exactos, roles conocidos, estados ACTIVE y
NO_ROLE, capacidades sin duplicados, sucursal y coherencia entre estado y rol.
Una sucursal inactiva se representa como tal, sin inventar permisos.

`context(token, expectedUserId?, signal?)` permite comprobar la identidad esperada
en refrescos. Todos los métodos admiten AbortSignal. Las peticiones omiten cookies,
rechazan redirecciones y piden no almacenar respuestas en caché. Los errores HTTP
se presentan mediante mensajes locales; no se exponen detalles del servidor.
No hay reintentos automáticos de contraseña ni cambio de motor ante fallos.
El futuro AuthProvider deberá invalidar estado inmediatamente al cambiar identidad
o cerrar sesión y proteger respuestas obsoletas. Este servicio no sustituye ese
ciclo de vida ni la autorización del servidor.

Verificaciones de esta sesión:

- `npm test`: 367 pruebas aprobadas, incluidas seis del contrato nuevo.
- `npm run lint` y `npm run build`: aprobados.
- Prueba real local con el módulo TypeScript cargado por Vite: login demo,
  contexto OWNER con ID entero, comprobación de identidad, logout y posterior 401,
  pasando por Vite → API → MariaDB con migración 021. No fue una prueba de UI.
- Inicialmente Vitest/Vite encontraron spawn EPERM en el sandbox; los comandos
  aprobados fuera de esa restricción pasaron, sin instalar dependencias.

La prueba usó configuración y script temporales ignorados en ViveroApp, sin mostrar
secretos. Se cerró Vite y se detuvo el entorno Docker de prueba conservando volúmenes.
No se modificó SQL, Android ni servicios Supabase y no se repitieron sus suites.

Archivos propios: servicio, `backend-auth-service.test.ts`, esta guía y referencia
desde `docs/backend-browser-connection.md`. Cambios previos de configuración, README,
proxy y documentos se preservaron. Sin commit, push, operación remota ni despliegue.

Pendiente de activación: adaptar los servicios de catálogo/pedidos y atención
operativa que comparten identidad antes de reemplazar AuthProvider. Cambiar solo
el proveedor dejaría las RPC Supabase sin sesión válida. Este incremento es parte
de esa integración y no un módulo operativo ya migrado.

## Ciclo de vida incorporado al proveedor (2026-10-01)

`backend-session.ts` contiene el controlador por instancia y `useBackendSession.ts` lo conecta al AuthProvider existente; `auth-types.ts` expone el contrato `backend`. No hay proveedor global adicional ni singleton. `AuthProvider.signOut` también invalida inmediatamente la sesión API si existe. El acceso Supabase conserva sus contratos originales: el nuevo contexto API no habilita Administración ni la Caja legacy.

- `backend.signIn(email, password)` verifica login y contexto antes de publicar acceso. Mantiene contraseña sin recortar; recorta correo. No permite login duplicado ni cambio de identidad sobre una sesión activa: cerrar primero.
- Token únicamente en memoria. Al recargar hay que iniciar sesión otra vez. Los intentos operativos persistidos conservan sus claves y se podrán recuperar al volver a autenticarse con la misma cuenta/sucursal; este bloque no los modifica.
- Duración conservadora de una hora contada desde que empezó el login. Timer, foco y visibilidad comprueban vencimiento; foco/visibilidad verifican contexto en servidor. No hay refresh token ni renovación automática de contraseña.
- Refrescar invalida los permisos anteriores mientras se consulta. Fallo de red: sesión conservada sin contexto y `accessStatus=error`, con reintento explícito. 401: sesión invalidada. Un contexto de otra identidad se rechaza.
- Cierre invalida token/contexto inmediatamente, cancela peticiones y evita que respuestas antiguas restauren acceso. Intenta revocación remota con timeout; `backend.signOut()` devuelve false si no pudo confirmarla, aunque el cierre local ya ocurrió. En ese caso la sesión del servidor puede durar hasta su vencimiento.
- Desmontaje y `pagehide` limpian el estado e intentan revocar. La descarga de página no garantiza que el servidor reciba la revocación. Compatible con el montaje doble de efectos en StrictMode.
- Estado autenticado no implica permiso de Caja: el consumidor debe exigir contexto `ACTIVE`, capacidades efectivas y sucursal activa. No se mapean cuentas API a UUID Supabase.

Validación nueva: `npm test` 436 pruebas / 34 archivos correctos (9 nuevas de ciclo de vida), lint sin advertencias y build correctos. No se ejecutó una nueva prueba de navegador/Docker del hook; las pruebas de servicio previas no prueban este ciclo React. Sin cambios de backend, SQL, Android, formulario de login ni rutas.

### Dependencia antes de activar Caja

La bandeja todavía recibe las ventas Android y los pedidos Web almacenados en Supabase. Sustituirla por MariaDB ahora haría desaparecer esas ventas del recorrido operativo. Por eso este incremento prepara la sesión en el proveedor, pero mantiene el flujo visible. El corte exige migrar coordinadamente emisores (Android/envíos pendientes y catálogo/pedidos/atención Web), datos e identidades y Caja, o una transferencia de ventas expresamente diseñada y autorizada. No se introdujo esa transferencia ni se consultaron datos reales.

No basta con cambiar un token o convertir UUID a entero. Esta dependencia pertenece a los frentes ya documentados de Web, Android y datos; no constituye un nuevo frente añadido al alcance.
