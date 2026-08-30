# Vivero Dulcinea Web

Aplicación web de Vivero Dulcinea construida con React, TypeScript y Vite. El catálogo público, la autenticación, el contexto de acceso, Caja y parte de Administración usan contratos reales de Supabase; los módulos aún demostrativos se identifican de forma explícita.

## Checkpoint del MVP

- Caja Web está congelada funcionalmente en `c99fd10882f42639904c8d1d67a9722274f543c1` y consume el contrato backend local `79681695ad493718b4f11195d421de3719343555`. Incorpora actualización automática local por polling seguro cada 10 segundos sin usar Realtime; el botón de actualización manual permanece activo.
- Caja, Administración y el Panel de Acceso Interno son integraciones locales reales.
- Administración esencial incorpora directorios reales de sucursales y personal (incluyendo asignación de rol y sucursal, y activación/desactivación de trabajadores vía `set_user_active` sin claves administrativas ni creación de cuentas auth en el navegador), catálogo administrativo real local de productos y categorías, administración de clientes real local, mutaciones protegidas, recepción idempotente, conteo e historial de inventario y reportes básicos sobre contratos autoritativos de ViveroApp.
- Las promociones y los pedidos continúan siendo exclusivamente de demostración.
- Pasan 205 pruebas unitarias, lint y build.
- Permanecen pendientes la ejecución de las 23 migraciones desde cero, las 306 aserciones pgTAP, los escenarios integrales de prueba, las pruebas integrales de roles en Web y la prueba real Android -> Caja -> confirmación de pago. No existe autorización de despliegue en staging o producción.

El orden restante, los gates y la propuesta para el siguiente módulo se mantienen en [MVP_ROADMAP.md](MVP_ROADMAP.md).

## Requisitos

- Node.js 24 o una versión compatible con las dependencias del proyecto.
- npm.
- Supabase CLI y Docker únicamente si se probará el backend local.

## Preparación

```bash
npm install
```

Copia `.env.example` como `.env.local` y completa únicamente estas variables públicas:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`VITE_SUPABASE_URL` puede apuntar a Supabase local durante desarrollo. La aplicación acepta exclusivamente hosts loopback para esa modalidad. Nunca coloques una clave `service_role` en variables de Vite, código, documentación o Git: todo valor `VITE_*` puede incorporarse al bundle del navegador.

## Comandos

```bash
npm run dev
npm test
npm run lint
npm run build
```

`npm run dev` inicia el servidor de desarrollo. `npm test` ejecuta las pruebas unitarias, `npm run lint` revisa el código y `npm run build` ejecuta TypeScript y genera el bundle de producción.

## Supabase local

Inicia el proyecto local desde el repositorio backend correspondiente y usa su URL loopback y clave pública en `.env.local`. No enlaces este repositorio a un proyecto remoto para las pruebas locales y no uses credenciales, usuarios ni datos reales.

## Rutas

- `/`: inicio y catálogo público.
- `/catalogo`: catálogo público con búsqueda, categorías y paginación.
- `/login`: inicio de sesión y consulta del contexto de acceso real.
- `/panel`: entrada interna centralizada basada en capacidades efectivas.
- `/caja`: Caja real protegida por sesión, capacidad y sucursal activa.
- `/admin`: Administración mixta protegida por capacidades; sucursales, personal, productos, clientes, inventario y reportes son reales, mientras las promociones siguen identificadas como demo.

## Estado y autoridad de acceso

- El catálogo público consulta `get_public_catalog` V2 sin requerir sesión, valida estrictamente su respuesta y resuelve sus imágenes desde el bucket público `catalog-images` mediante el cliente Supabase.
- Caja consume los RPC autoritativos de bandeja, detalle, claims, confirmación y recuperación de pagos. Conserva localmente solo el intento técnico versionado necesario para idempotencia y recuperación; no almacena datos de tarjeta ni sustituye las validaciones del backend.
- Administración consulta directorios reales de sucursales y personal, gestiona el catálogo real de productos y categorías, administra clientes en tiempo real de forma segura, registra recepciones de inventario, concilia conteos, consulta saldos e historial de inventario mediante RPC estrictamente validados, y obtiene reportes de ventas desde Supabase. Las promociones conservan datos demo explícitos.
- La sesión y el contexto de acceso provienen de Supabase mediante `get_my_access_context()`.

Los guards del cliente mejoran la navegación y evitan mostrar módulos no autorizados, pero no sustituyen la seguridad del backend. La autoridad final corresponde a RLS, permisos SQL y RPC definidas en el repositorio backend.

Si Supabase no responde al cerrar sesión, la aplicación elimina la sesión local y bloquea inmediatamente el contenido protegido. En ese caso, la invalidación de la sesión remota podría quedar pendiente hasta que el backend vuelva a estar disponible.
