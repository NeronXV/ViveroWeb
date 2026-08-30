# Roadmap del MVP

## Estado canónico al 29 de agosto de 2026

| Área | Estado | Evidencia o gate |
|---|---|---|
| Catálogo público | Integración real local | `get_public_catalog` V2 y pruebas Web existentes |
| Sesión y acceso | Integración real local | `get_my_access_context()` y guards por capacidad |
| Caja Web | Código auditado y congelado | Web `c99fd10882f42639904c8d1d67a9722274f543c1`; backend `79681695ad493718b4f11195d421de3719343555` |
| Administración | Parcial real | Directorios, personal (incluye activar/desactivar y asignación de rol/sucursal sin clave administrativa), sucursales, inventario físico, catálogo real de productos/categorías, clientes real, reportes de ventas integrados; promociones pendientes |
| Panel de Acceso Interno | Integración real local | Centraliza `/caja`, `/admin` y control de perfiles activos |
| Publicación de código | GitHub actualizado | Sin despliegue, staging ni producción |

La infraestructura local basada en Docker Desktop, WSL y Supabase CLI queda fuera de investigación hasta nueva indicación. Esto no convierte las validaciones omitidas en aprobadas.

## Gate pendiente de Caja

Antes de considerar Caja desplegable deben ejecutarse en un entorno local seguro y funcional:

1. Las 23 migraciones desde una base vacía.
2. Las 306 aserciones pgTAP actuales. El resultado histórico 215/215 no sustituye una ejecución actual.
3. Los veinte escenarios integrales documentados: autorización, bandeja, detalle, competición y renovación de claims, liberación, pagos, doble pulsación, incertidumbre, recuperación, recarga, cambio de usuario, expiración, venta pagada, terminalidad, paginación y contrato incompatible.

## Inspección de solo lectura del siguiente módulo

La fase actual es Administración de sucursales y personal. El backend autoritativo contiene:

- `create_branch(text, text)`, `update_branch(uuid, text, text)` y `set_branch_active(uuid, boolean)`, protegidos por `MANAGE_BRANCHES`;
- `assign_user_branch(uuid, uuid)`, protegido por `MANAGE_USERS`;
- `assign_user_role(uuid, text)`, protegido por `ASSIGN_ROLES` y por la jerarquía `ADMIN`/`OWNER`;
- lectura RLS de `branches`, `profiles`, `user_roles` y `roles` para usuarios autorizados.

La migración `202608280002_admin_web_contract.sql` añadió las proyecciones JSON V1 `get_admin_branches` y `get_admin_staff`. Web consume ambas sin acoplarse a tablas ni exponer datos de autenticación, integra las mutaciones administrativas existentes, y obtiene reportes básicos. Android y Web ya integran localmente el contrato seguro de recepción idempotente, conteo e historial de inventario de `202608290011_inventory_pilot_contract.sql`; Web conserva además `get_admin_inventory_balances` para supervisión. Su ejecución integral contra las 23 migraciones permanece pendiente.

## Contrato local de Administración

La migración 12 define dos funciones `security definer`, `set search_path = ''`, propiedad de `postgres`, ejecución revocada a `PUBLIC`, `anon` y `service_role`, y concedida solo a `authenticated`:

### `get_admin_branches(integer, text, uuid, boolean)`

Parámetros:

- `p_limit integer default 50`, entre 1 y 100;
- `p_after_code text default null` y `p_after_id uuid default null`, ambos nulos o ambos presentes;
- `p_include_inactive boolean default false`.

Autorización: perfil activo con `MANAGE_BRANCHES` o `MANAGE_USERS`.

Orden estable: `code ASC, id ASC`.

Respuesta `jsonb`:

```json
{
  "schemaVersion": 1,
  "items": [{
    "id": "uuid",
    "code": "CENTRO",
    "name": "Sucursal Centro",
    "isActive": true,
    "activeStaffCount": 4,
    "pendingSaleCount": 2,
    "updatedAt": "timestamptz"
  }],
  "page": {
    "limit": 50,
    "nextCursor": { "code": "CENTRO", "id": "uuid" },
    "hasMore": true
  },
  "serverTime": "timestamptz"
}
```

Errores estables: `ADMIN_UNAUTHORIZED`, `ADMIN_BRANCH_QUERY_INVALID`.

### `get_admin_staff(integer, text, uuid, text, uuid, boolean)`

Parámetros:

- `p_limit integer default 50`, entre 1 y 100;
- `p_after_full_name text default null` y `p_after_id uuid default null`, ambos nulos o ambos presentes;
- `p_search text default null`, normalizado y con máximo 80 caracteres;
- `p_branch_id uuid default null`;
- `p_include_inactive boolean default false`.

Autorización: perfil activo con `MANAGE_USERS`.

Orden estable: `lower(full_name) ASC, id ASC`.

Respuesta `jsonb`:

```json
{
  "schemaVersion": 1,
  "items": [{
    "id": "uuid",
    "fullName": "Nombre mostrado",
    "isActive": true,
    "branch": { "id": "uuid", "code": "CENTRO", "name": "Sucursal Centro", "isActive": true },
    "role": { "name": "CASHIER", "displayName": "Cajero" },
    "updatedAt": "timestamptz"
  }],
  "page": {
    "limit": 50,
    "nextCursor": { "fullName": "Nombre mostrado", "id": "uuid" },
    "hasMore": true
  },
  "serverTime": "timestamptz"
}
```

No debe exponer correo, metadatos de autenticación, tokens ni campos de `auth.users`.

Errores estables: `ADMIN_UNAUTHORIZED`, `ADMIN_STAFF_QUERY_INVALID`.

## Pruebas requeridas para aprobar el contrato

- firmas, propietario, `search_path` vacío y lista mínima de grants;
- rechazo de `anon`, perfil inactivo y capacidades insuficientes;
- visibilidad de sucursales activas e inactivas según parámetro;
- paginación determinista sin duplicados ni omisiones;
- búsqueda normalizada y límites de entrada;
- jerarquía `ADMIN`/`OWNER` preservada en las mutaciones existentes;
- privacidad: ausencia de correo, claims, secretos y datos de `auth.users`;
- conteos de personal y ventas pendientes coherentes;
- `schemaVersion` y estructura JSON exactos.

Hasta que las migraciones y sus pruebas puedan ejecutarse, la aplicación se considera integración local no desplegable. Las promociones y pedidos continúan siendo exclusivamente demostrativos. Caja Web incorpora actualización automática local por polling seguro cada 10 segundos sin usar Realtime (el botón manual permanece activo, y esto no sustituye las pruebas integrales). La ejecución de las 23 migraciones desde cero, las 306 aserciones pgTAP, los escenarios completos de Caja y la prueba real Android -> Caja -> confirmación de pago siguen pendientes. No se autoriza el despliegue a staging o producción.
