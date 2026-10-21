# ViveroWeb: contexto selectivo

Consulta este mapa cuando la tarea necesite arquitectura o contexto relevante;
no es una lectura automática para ajustes pequeños y aislados.

## Arquitectura y responsabilidades

- SPA React/TypeScript/Vite. `src/main.tsx` compone AuthProvider, DemoStoreProvider,
  PublicCartProvider y RouterProvider; rutas/layouts en `src/app/router.tsx`.
- `src/features/` agrupa auth, acceso, catálogo, pedidos, caja y administración.
  Flujo operativo: componente/hook -> servicio de frontera -> API de ViveroApp.
  Sesión API en `features/auth/AuthProvider.tsx`; contexto/capacidades validados.
- Compartidos: `src/components/`, `src/app/providers/`, `src/lib/`; estilos/tokens
  en `src/styles/`, recursos en `src/assets/`. npm/lockfile fijan dependencias.
- `src/lib/supabase/` y fuentes demo remanentes no implican uso operativo ni
  fallback. `src/data/mock/`, tipos demo y DemoStore no son datos persistidos reales.
- Backend y contratos SQL pertenecen a ViveroApp (`backend/`, `database/mysql/`;
  Supabase legado en `supabase/migrations/`). Web no decide precios, stock ni permisos.

## Leer según tarea, no todo el catálogo

- [Recepción PDF](../reception-document-review.md): publicación, pruebas previas y aceptación.
- [Compras API](../../../ViveroApp/docs/backend-purchases.md) y
  [arquitectura compartida](../../../ViveroApp/docs/ai/PROJECT.md): responsabilidad servidor.
- Según la tarea, elegir secciones pertinentes de
  [estado](../PROJECT_STATUS.md), [roadmap](../ROADMAP.md),
  [reglas MVP](../MVP_RULES.md) o [tarea documentada](../tasks/current.md).
  No es obligatorio abrir los cuatro ni leerlos completos. Mantienen notas de
  etapas anteriores: evidencia de entrega más reciente y código
  vigente prevalecen sobre descripciones históricas de Supabase o producción.
- [README](../../README.md): navegación general; [HANDOFF](HANDOFF.md): estado para
  retomar trabajo; [AGENTS](../../AGENTS.md): reglas obligatorias. No duplicar sus listados.

## Referencia estable, no comprobación en vivo

Etiqueta compartida `prod-reception-pdf-2026-10-20`; Web corresponde al commit
`c5e7935e6de2b0bf853747ed280c01a6c1845faa` y API al
`35149cfec94e07bdef692a35905b128e59e5a7a1`. La guía de recepción conserva
procedencia de imágenes y límites de reproducción exacta.
Pedro confirmó lectura de ticket y cotización; guardar una recepción real permanece
pendiente. No inferir aceptación integral, nuevas pruebas ni permisos de este resumen.
