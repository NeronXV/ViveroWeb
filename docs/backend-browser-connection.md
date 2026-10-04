# Canal de desarrollo Web → Backend API (2026-10-01)

Proxy oficial Vite para `/api/v1` preparado y verificado con MariaDB local.
No modifica aún los servicios de catálogo, auth, pedidos ni caja: siguen Supabase.
No hay segundo AuthProvider, canje de JWT, fallback ni selector de motor.

Configurar `.env.local` con BACKEND_PROXY_TARGET=http://127.0.0.1:API_PORT;
es variable privada de Vite, no VITE_* ni secreto de base de datos. Backend
requiere WEB_ORIGIN=http://localhost:5173 en su configuración local ignorada.
Vite usa localhost:5173 con strictPort, conservando cabeceras. Solo se admiten
destinos HTTP loopback sin credenciales/ruta/query/fragmento. API mantiene
sesiones/capacidades, rechaza otros orígenes y solicitudes cross-site, sin CORS.

La UI y sus datos actuales no cambian de motor. `/api/v1/products` ya permite
comprobar el canal desde ese origen con el catálogo de demo del backend; no
mezclar sus IDs enteros con los UUID del carrito Supabase.

Prueba HTTP con Vite real + API + MariaDB aprobada para lectura, login sintético,
contexto OWNER, reportes y logout, con rechazo de origen ajeno y escrituras sin
sesión. No prueba pantallas migradas. Servidor temporal cerrado al terminar.
Lint y build aprobados; 361/361 pruebas Web en 26 archivos. Backend: 57/57
unidades y 21/21 integraciones aprobadas. Sin nuevas dependencias ni lockfile.

```powershell
npm run lint
npm run build
npm test
npm run dev
```

En producción, servir API y Web bajo el mismo dominio mediante reverse proxy;
Vite dev proxy no forma parte del bundle. Contrato y comandos completos en
`ViveroApp/docs/backend-browser-connection.md` del repositorio autoritativo.
Siguiente cambio: catálogo/carrito/pedidos y administración con sesión API como
recorrido completo, preservando el tratamiento del carrito anterior.
Sin commit, push, despliegue ni cambios remotos.

Servicio de sesión API preparado y probado: [backend-web-session.md](backend-web-session.md). AuthProvider aún conserva Supabase hasta coordinar sus consumidores.
