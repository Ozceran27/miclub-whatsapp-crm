# Onboarding canónico

1. Crear el club y su membresía directora mediante el flujo autenticado.
2. Configurar sectores persistidos; sus UUID son la identidad estable en navegación, reportes y liquidaciones.
3. Configurar actividades y sus términos económicos con vigencia.
4. Asignar permisos mínimos a cada rol y validar `/auth/me`.
5. Elegir el plan comercial. `FREE` es el valor inicial y no permite importar; `SOCIAL`, `COMPLEX` y `CLUB` incluyen `DATA_MIGRATION`.
6. La finalización valida el código contra el catálogo activo, cambia la suscripción y audita el cambio dentro de la misma transacción que crea el resto del borrador. Un fallo revierte todo y un reintento completado no duplica datos.
7. Después del onboarding, si la suscripción quedó activa, abrir **Migración** desde el panel, ejecutar el XLSX en dry-run, corregir referencias y confirmar el lote.

## Selección y cobro

`SOCIAL`, `COMPLEX` y `CLUB` son códigos canónicos persistidos; no son nombres de `GROWTH`, `PROFESSIONAL` o `ENTERPRISE`. No conviven ambas taxonomías. La selección paga libre se limita a `NODE_ENV=test`. En producción se rechaza salvo `ONBOARDING_PAID_PLAN_SELECTION_ENABLED=true`; aun con esa señal explícita se crea como `pending_payment` y no concede capacidades hasta que una futura pasarela la active. No existen precios, modal de tarjeta ni cobros simulados.
