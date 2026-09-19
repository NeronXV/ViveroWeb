# Tickets de Caja en Windows

Después del cobro confirmado, **Imprimir ticket** abre el diálogo del navegador. El comprobante usa los datos canónicos del pago: Vivero Dulcinea, sucursal, folio, fechas, productos, total, medio de pago y efectivo/cambio cuando aplica. No se inventan domicilio ni teléfono.

Para la Black Pos WW-5888T USB, instala primero el controlador compatible en Windows y verifica su página de prueba. Selecciona papel de **58 mm**, escala **100 %**, sin encabezados ni pies del navegador. El contenido ocupa 52 mm con márgenes de 3 mm; el formato paginado es 58 × 200 mm. Tickets extensos pueden ocupar varias páginas. Verifica márgenes y avance de papel con el controlador real.

**Reimprimir una venta** conserva como máximo 100 referencias de cobros confirmados desde esta implementación, separadas por usuario y sucursal en este navegador. Tras cerrar el cobro o recargar Caja, selecciona el folio y pulsa **Reimprimir ticket**. Se consulta de nuevo `get_cashier_payment_result` bajo la sesión actual; nunca se confirma otro pago ni se guarda un ticket completo en el historial. La copia lleva la leyenda REIMPRESIÓN. Cancelar la impresión no cambia el pago.

Se requiere conexión para recuperar el comprobante. Borrar los datos del navegador elimina esta lista; no incluye ventas antiguas, de Android ni de otras computadoras. Una búsqueda histórica general por folio requiere un contrato backend adicional. La impresión silenciosa y apertura de cajón no están incluidas.

Validación física pendiente: ticket corto y largo, nombres largos, acentos/ñ, efectivo y cambio, tarjeta, cancelar y reintentar, recargar Caja y reimprimir. No presentar el diálogo cerrado como prueba de impresión física exitosa.
