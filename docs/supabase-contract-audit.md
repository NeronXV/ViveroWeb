# Auditoría de contratos Supabase de ViveroWeb

Fecha de revisión: 2026-08-29.

## Autoridad y alcance

La fuente autoritativa es `ViveroApp/supabase/migrations`. ViveroWeb no define
esquema, RLS, privilegios ni reglas monetarias. Esta revisión comparó
estáticamente los nombres de funciones, parámetros y respuestas consumidos por
Web contra la cadena de migraciones disponible hasta
`202608290012_my_sales_contract.sql`.

La revisión no ejecutó migraciones ni pgTAP. El árbol de ViveroApp estaba siendo
modificado en paralelo por el agente de Android Studio; por ello, cualquier
cambio posterior de contrato exige repetir esta matriz antes del piloto.

## Matriz de integración

| Área Web | Frontera Supabase | Estado estático | Observación |
| --- | --- | --- | --- |
| Sesión | `auth.getSession`, `auth.signInWithPassword`, `auth.signOut` | Conforme | Sólo usa URL y clave publicable configuradas localmente. |
| Acceso | `get_my_access_context()` | Conforme | Respuesta versionada y parseada con claves exactas. |
| Catálogo público | `get_public_catalog(p_search, p_category_id, p_limit, p_after_name, p_after_id)` | Conforme | Límite 1–50, cursor pareado y respuesta versionada. |
| Imágenes públicas | bucket `catalog-images` mediante `getPublicUrl` | Conforme | La ruta y el origen público se validan antes de mostrarse. |
| Bandeja de Caja | `get_cashier_sales(p_limit, p_after_created_at, p_after_id)` | Conforme | Polling limitado a 50 y pausado durante cobros críticos. |
| Detalle de Caja | `get_cashier_sale_detail(p_sale_id)` | Conforme | Las partidas no aceptan `unit`; sólo datos persistidos con la venta. |
| Reserva de cobro | `claim_sale_for_payment(p_sale_id, p_claim_token)` | Conforme | Token de reserva y renovación verificados contra la solicitud. |
| Liberación de cobro | `release_sale_payment_claim(p_sale_id, p_claim_token)` | Conforme | Identidad de venta y token verificados. |
| Confirmación de cobro | `confirm_sale_payment(...)` | Conforme | Método, importe, referencia e idempotencia se comparan con la respuesta. |
| Recuperación de cobro | `get_cashier_payment_result(p_sale_id, p_idempotency_key)` | Conforme | Las partidas tampoco aceptan `unit`. |
| Sucursales | `get_admin_branches`, `create_branch`, `update_branch`, `set_branch_active` | Conforme | Parámetros `p_branch_id` y `p_is_active`; filas `branches` en snake_case. |
| Personal | `get_admin_staff`, `assign_user_branch`, `assign_user_role`, `set_user_active` | Conforme | No se envían rol o sucursal nulos; las restricciones de jerarquía siguen en backend. |
| Productos | lectura RLS de `products`/`categories`; `upsert_product` | Conforme | Lecturas con columnas explícitas; mutaciones por RPC autoritativo. |
| Categorías | lectura RLS de `categories`; `upsert_category` | Conforme | Respuestas de tabla parseadas con claves exactas. |
| Imagen primaria | `set_product_image_primary(p_image_id)` | Conforme | Mutación `void`; sólo se acepta respuesta `null`. |
| Clientes | `search_customers(p_query, p_limit)`, `upsert_customer(...)` | Conforme | Búsqueda de 2–80 caracteres y límite 1–50. |
| Reporte diario | `get_report_daily_sales(p_branch_id, p_start_date, p_end_date)` | Conforme | Importes tratados como centavos enteros. |
| Productos más vendidos | `get_report_top_products(p_branch_id, p_limit)` | Conforme | Cantidad agregada y total en centavos provienen del backend. |
| Inventario | `get_admin_inventory_balances(...)` | Conforme | Paginación máxima de 100 por página y sucursal comprobada entre páginas. |
| Recepción | `record_inventory_reception(...)` | Conforme estáticamente | Operación idempotente; requiere validación real de base antes del piloto. |
| Conteo físico | `reconcile_inventory_count(...)` | Conforme estáticamente | Operación idempotente; requiere validación real de base antes del piloto. |
| Historial | `get_my_inventory_history(...)` | Conforme estáticamente | `createdByLabel` es metadato actual de presentación, no copia histórica inmutable. |

## Endurecimientos aplicados en Web

- Los timeouts de catálogo administrativo y clientes ahora abortan la consulta
  efectiva, incluso cuando el llamador no proporciona una señal.
- Las lecturas directas de productos y categorías declaran sus columnas; no usan
  `select('*')`.
- Los errores desconocidos del backend se sustituyen por mensajes seguros y no se
  muestran detalles internos.
- `search_customers` rechaza localmente límites fuera del contrato 1–50.
- Las respuestas `void` sólo aceptan `null` y las filas de sucursal rechazan
  campos adicionales.

## Pendientes obligatorios antes del piloto

- Ejecutar todas las migraciones desde cero en una pila local limpia.
- Repetir toda la suite pgTAP y la verificación estática de migraciones.
- Ejecutar escenarios de navegador con al menos OWNER, ADMIN, MANAGER, CASHIER y
  SELLER, incluyendo cierre y reapertura de sesión.
- Probar el recorrido Android → comanda pendiente → reserva → cobro → resultado,
  con reintento idempotente y dos cajas concurrentes.
- Probar recepción, conteo e historial de inventario con usuarios autorizados y
  no autorizados.
- Repetir esta auditoría cuando termine el trabajo paralelo de ViveroApp.

Hasta completar esos puntos, Caja, cobros e inventario no deben describirse como
integralmente validados ni desplegables. No se habilitaron descuentos en Caja:
`apply_sale_discount` existe en backend, pero conectarlo es una fase monetaria
separada que requiere pruebas de base y una decisión explícita de experiencia de
usuario.
