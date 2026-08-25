# Vivero Dulcinea Web

Aplicación web de Vivero Dulcinea construida con React, TypeScript y Vite. El catálogo, Caja y Administración todavía trabajan con datos demostrativos locales; la autenticación y el contexto de acceso usan Supabase.

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
npm run lint
npm run build
```

`npm run dev` inicia el servidor de desarrollo. `npm run lint` revisa el código y `npm run build` ejecuta TypeScript y genera el bundle de producción.

## Supabase local

Inicia el proyecto local desde el repositorio backend correspondiente y usa su URL loopback y clave pública en `.env.local`. No enlaces este repositorio a un proyecto remoto para las pruebas locales y no uses credenciales, usuarios ni datos reales.

## Rutas

- `/`: inicio y catálogo resumido de demostración.
- `/catalogo`: catálogo completo de demostración.
- `/login`: inicio de sesión y consulta del contexto de acceso real.
- `/caja`: Caja demostrativa protegida por sesión, capacidad y sucursal activa.
- `/admin`: Administración demostrativa protegida por capacidades.

## Estado y autoridad de acceso

- El catálogo utiliza datos locales de demostración.
- Caja utiliza datos locales de demostración y exige autorización real antes de renderizarse.
- Administración utiliza datos locales de demostración y protege cada módulo por capacidad.
- La sesión y el contexto de acceso provienen de Supabase mediante `get_my_access_context()`.

Los guards del cliente mejoran la navegación y evitan mostrar módulos no autorizados, pero no sustituyen la seguridad del backend. La autoridad final corresponde a RLS, permisos SQL y RPC definidas en el repositorio backend.

Si Supabase no responde al cerrar sesión, la aplicación elimina la sesión local y bloquea inmediatamente el contenido protegido. En ese caso, la invalidación de la sesión remota podría quedar pendiente hasta que el backend vuelva a estar disponible.
