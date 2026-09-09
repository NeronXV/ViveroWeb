# Versión presencial — cambios locales del 8 septiembre 2026

Sitio: https://vivero-dulcinea.netlify.app

La documentación autoritativa de configuración, límites y validaciones se encuentra en el repositorio hermano ViveroApp, docs/presential-release.md. Las migraciones y Edge Functions pertenecen exclusivamente a ViveroApp.

Esta entrega conecta pedidos con Caja, agrega cortes y devoluciones totales en web, activa inventario por sucursal, reemplaza el asistente y test demo con datos reales, prepara boletín Resend e incorpora recuperación e invitaciones de personal. El cobro sigue siendo presencial.

No desplegar solamente la web: requiere revisión y aplicación autorizada de los tres contratos 202609080001–003 y configuración/publicación de Edge Functions. Los secretos Resend/service_role son exclusivos del servidor.

Pendiente antes de considerarlo operativo: pgTAP (Docker no autorizado), prueba autenticada en navegador, SMTP Auth, cuenta/remitente Resend y prueba de correo real. La administración editorial continúa deshabilitada. Reportes muestran cobros antes de devoluciones; el neto de operaciones aparece en Caja.

Este repositorio estaba limpio al iniciar estos cambios. No se hicieron commit, push ni despliegue.
