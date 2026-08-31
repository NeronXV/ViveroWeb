# Arquitectura operativa

## Aplicación

ViveroWeb es una SPA de React y TypeScript construida con Vite. React Router declara las rutas y carga las áreas funcionales. La organización principal es por funcionalidades bajo `src/features`.

Flujo esperado:

```text
Página o componente -> hook/contexto -> servicio/parser -> Supabase
                                      -> DemoStore sólo en módulos demo explícitos
```

## Autoridades

- `AuthProvider`: sesión y contexto de acceso del navegador.
- `src/features/access`: capacidades, guards y validación del contrato de acceso.
- `src/lib/supabase`: configuración y cliente único.
- `ViveroApp/supabase/migrations`: autoridad externa para esquema, RPC, RLS, permisos y reglas críticas.
- PostgreSQL: autoridad final de precios, ventas, pagos e inventario.
- El navegador: presentación, interacción y estado técnico recuperable; nunca autoridad de cobro.

## Áreas

- `public-catalog`: catálogo público real.
- `auth` y `access`: sesión y autorización de interfaz.
- `internal-home`: entrada interna basada en capacidades.
- `cashier`: bandeja, detalle, claim, cobro y recuperación.
- `admin`: sucursales, personal, catálogo, clientes, inventario, reportes y módulos demo identificados.

## Contratos compartidos

La Web consume RPC definidos en ViveroApp. Si necesita un cambio de contrato, debe coordinarse primero en el repositorio backend y versionar la respuesta cuando corresponda. Los parsers de frontera rechazan payloads desconocidos para no convertir datos inválidos en permisos o cobros aparentes.

## Estrategia MVP

Se conserva el piso crítico de autenticación, autorización, secretos, RLS, totales autoritativos e idempotencia. Para el resto se prioriza el camino funcional y se difieren optimizaciones, casos extremos y refactors sin impacto observado.

## Datos demo

Los datos demo deben seguir separados, identificados y fuera de cualquier operación presentada como persistida. No se implementan fallbacks silenciosos de Supabase hacia datos demo.

## Validación

- `npm run build`: compilación y bundle.
- `npm run lint`: análisis estático.
- `npm test`: pruebas unitarias.

Durante el avance MVP se ejecuta primero la validación específica y proporcional. Las suites completas se reservan para cambios de riesgo, contratos compartidos y checkpoints integrales.
