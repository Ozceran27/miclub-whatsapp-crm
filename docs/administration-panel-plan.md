# Plan del panel de administración

**Fecha:** 2026-08-05  
**Alcance:** plan de producto, datos y operación para evolucionar el módulo **ADMINISTRACIÓN** sin cambiar el runtime de backend ni frontend en esta PR.  
**Fuentes canónicas:** [`architecture-current.md`](architecture-current.md), [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md), [`api-route-inventory.md`](api-route-inventory.md), [`business-rules/operational-balances.md`](business-rules/operational-balances.md) y diagnósticos SQL bajo [`dbeaver/`](dbeaver/).

## Arquitectura actual

### Plataforma y fuentes de datos

- PostgreSQL es la fuente autoritativa para identidad, membresías, CRM, personas, operación, finanzas y auditoría.
- El runtime productivo debe arrancar con `AUTH_ENABLED=true`, `DATA_SOURCE=postgres`, `CRM_SOURCE=postgres`, sesión robusta, `PUBLIC_APP_URL` HTTPS y conexión PostgreSQL válida.
- Google Sheets existe sólo como origen temporal de importación hacia PostgreSQL. No debe operar como read path del panel administrativo.
- SQLite, mocks y artefactos legacy se conservan únicamente para pruebas, auditoría histórica o migración; no son fallback productivo.

### Autenticación, autorización y tenant

- La API deriva `clubId` desde la sesión autenticada y la membresía activa.
- Las rutas tenant-scoped no deben aceptar `clubId` controlado por el cliente.
- El permiso vigente para consultar administración es `administration.view`.
- Importaciones y endpoints debug requieren flags y permisos específicos, y deben permanecer apagados fuera de ventanas operativas aprobadas.

### Superficies existentes de administración

- Frontend: el shell protegido ya incluye el módulo `administration` en la navegación y renderiza un módulo administrativo de lectura.
- Backend: existe el montaje `/api/administration` protegido por autenticación, tenant y permiso de vista.
- Modelo de lectura actual:
  - último corte de `miclub.operational_balances` por `club_id`;
  - ingresos, egresos, balance y cantidad de movimientos pendientes filtrados por hoja `ADMINISTRACIÓN`;
  - últimos 10 movimientos administrativos desde `miclub.v_movements_enriched`.
- Las reglas financieras operativas actuales distinguen saldos reales, pendientes, estados cancelados/no completados, caja, banco y dólares.

### Restricción explícita de este plan

Este documento no modifica runtime. Cualquier cambio posterior debe implementarse en PRs separadas con migraciones versionadas, pruebas, evidencia de aislamiento tenant y rollback aprobado.

## Brechas

### Producto y UX

1. El módulo actual es un shell/read model inicial; falta una experiencia completa para buscar, filtrar, conciliar y accionar movimientos.
2. No hay definición documentada de roles por acción administrativa más allá de `administration.view`.
3. Faltan criterios visuales y funcionales para estados: completado, pendiente, cancelado, imputación dudosa y conciliación.
4. No existe flujo documentado para corrección manual asistida, aprobación de ajustes o comentarios administrativos.
5. Falta navegación desde saldos agregados hacia movimientos fuente y evidencia de cálculo.

### Datos y consistencia

1. Los saldos administrativos dependen de importaciones históricas y cortes operativos; se requiere reconciliación periódica entre balances, movimientos y vistas derivadas.
2. La procedencia `source_payload->>'sheet' = 'ADMINISTRACIÓN'` funciona para importaciones, pero debe auditarse antes de soportar edición nativa.
3. Falta un contrato explícito para adjuntos/comprobantes, notas, conciliación bancaria y responsable humano del cambio.
4. Las correcciones manuales SQL existentes son runbooks puntuales, no un flujo operacional permanente.
5. Falta una matriz de invariantes de datos previa a habilitar escrituras desde UI.

### API y seguridad

1. El panel aún no cuenta con endpoints de escritura transaccional para crear, editar, cancelar o conciliar movimientos administrativos.
2. No hay permisos granulares documentados para `administration.manage`, `administration.reconcile`, `administration.export` o `administration.audit`.
3. Falta política de rate limit, idempotencia y auditoría enriquecida para acciones administrativas.
4. Debe confirmarse que todo endpoint futuro rechace `clubId` del cliente y opere sólo con tenant de sesión.
5. Falta contrato de exportación para reportes administrativos sin exponer datos de otros tenants.

### Operación

1. No hay checklist específico para habilitar el panel administrativo en producción.
2. Falta runbook de rollback funcional por fase.
3. Falta tablero de riesgos con dueños, señales de alerta y mitigaciones.
4. Los scripts SQL manuales deben quedar limitados a diagnóstico/remediación aprobada y nunca sustituir migraciones versionadas.

## Fases

### Fase 0 — Baseline y auditoría sin cambios funcionales

**Objetivo:** congelar estado actual y validar datos antes de diseñar escrituras.

- Reconfirmar invariantes de `checkpoint-pre-admin.md`.
- Ejecutar diagnósticos de schema y reconciliación sólo lectura en entorno no productivo.
- Inventariar categorías, medios de pago, estados operativos y sectores presentes en movimientos administrativos.
- Documentar diferencias entre saldos importados, vistas enriquecidas y balance mostrado.
- Definir métrica base: cantidad de movimientos, pendientes, cancelados, saldos por medio de pago y fecha de último corte.

**Salida:** reporte firmado de baseline con hallazgos, decisión go/no-go y lista priorizada de correcciones.

### Fase 1 — Panel de lectura operable

**Objetivo:** convertir el shell de lectura en una herramienta confiable de consulta sin escritura.

- Agregar filtros por fecha, tipo, categoría, sector, medio de pago, estado y texto libre.
- Agregar drill-down desde tarjetas de saldo hacia movimientos fuente.
- Mostrar fecha de corte, fuente de cálculo y advertencias cuando falten datos.
- Añadir paginación y orden estable por fecha e identificador.
- Exponer exportación controlada si se aprueba permiso específico.

**Salida:** panel read-only validado contra SQL de control y sin cambios de datos.

### Fase 2 — Correcciones controladas y auditoría

**Objetivo:** habilitar acciones administrativas acotadas con trazabilidad completa.

- Crear permisos granulares y rutas transaccionales para ajustes aprobados.
- Registrar cada acción en auditoría con usuario, club, antes/después, motivo e idempotency key.
- Definir estados permitidos y transiciones válidas.
- Impedir edición directa de movimientos importados sin crear evento de ajuste o corrección trazable.
- Validar concurrencia con locks o controles de versión donde corresponda.

**Salida:** capacidad de corrección auditable en entorno piloto, con rollback por acción.

### Fase 3 — Conciliación y cierre administrativo

**Objetivo:** soportar conciliación periódica y cierre operativo por período.

- Modelar cierres por período y responsable.
- Comparar caja, banco y dólares contra comprobantes/cortes externos.
- Bloquear modificaciones no autorizadas sobre períodos cerrados.
- Generar reporte de diferencias y ajustes posteriores al cierre.
- Definir re-apertura excepcional con doble autorización.

**Salida:** flujo de cierre mensual con evidencia y controles.

### Fase 4 — Despliegue productivo y retiro de deuda operativa

**Objetivo:** llevar el panel completo a producción sin reintroducir fallbacks legacy.

- Ejecutar gates de build, typecheck, pruebas API, migraciones y smoke tests.
- Validar aislamiento multi-tenant con usuarios de al menos dos clubes.
- Confirmar flags de import/debug apagadas después del despliegue.
- Publicar manual operativo y plan de soporte.
- Retirar scripts manuales obsoletos o moverlos a archivo histórico con advertencia.

**Salida:** panel administrativo productivo con monitoreo, rollback y soporte definidos.

## Criterios de aceptación

### Generales

- No existe dependencia productiva de Google Sheets, SQLite ni mocks para consultar administración.
- Todo acceso administrativo requiere sesión válida, membresía activa, tenant derivado del servidor y permiso explícito.
- Ningún endpoint futuro acepta `clubId` desde query, body o path para decidir el tenant operativo.
- Las respuestas no mezclan datos entre clubes y las pruebas lo demuestran.
- Los cálculos de saldos coinciden con SQL de control documentado para el mismo `club_id` y rango temporal.

### Fase 0

- Hay backup identificado antes de cualquier script de remediación.
- Los diagnósticos sólo lectura terminan sin modificar filas.
- El reporte enumera tablas, vistas, conteos y anomalías relevantes.
- Las brechas bloqueantes se clasifican como datos, schema, API, UX o seguridad.

### Fase 1

- El panel muestra saldos, pendientes y movimientos con estados y fechas comprensibles.
- Filtros y paginación son reproducibles y conservan orden estable.
- El usuario puede rastrear cada saldo agregado hasta movimientos fuente.
- El panel informa fecha de corte y ausencia de datos sin fallar silenciosamente.
- No se crean, actualizan ni borran filas desde UI.

### Fase 2

- Cada corrección genera auditoría antes/después y motivo obligatorio.
- Las acciones son idempotentes o rechazan duplicados de forma segura.
- Las reglas de transición impiden pasar estados inválidos.
- Los permisos distinguen lectura, gestión, conciliación, exportación y auditoría.
- El rollback por acción se prueba en entorno no productivo.

### Fase 3

- El cierre bloquea cambios ordinarios sobre períodos cerrados.
- Toda reapertura requiere permiso elevado, motivo y auditoría.
- Los reportes de cierre cuadran contra SQL de control.
- Las diferencias de conciliación quedan visibles y asignables.

### Fase 4

- `npm run db:migrations:check`, `npm run db:migrate`, `npm run typecheck`, `npm run build` y `npm run test -w @miclub/api` pasan en el entorno aprobado.
- Smoke tests validan login, logout, acceso admin, rechazo sin permiso y aislamiento tenant.
- Las flags de import/debug/bootstrap quedan apagadas al finalizar.
- Existe enlace interno al backup y al procedimiento de rollback ejecutable.

## Scripts SQL manuales

> Estos scripts son manuales y deben ejecutarse sólo en DBeaver/psql contra un entorno aprobado. No reemplazan migraciones versionadas. Sustituir `:club_id`, fechas y usuarios con valores reales. Ejecutar primero en transacción con `rollback` para revisar resultados.

### 1. Baseline sólo lectura por club

```sql
begin;

select current_database() as database_name, current_user as executed_by, now() as executed_at;

select id, name, created_at, updated_at
from miclub.clubs
where id = :club_id;

select
  count(*) as admin_movements,
  min(movement_date) as first_movement_date,
  max(movement_date) as last_movement_date,
  coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as income_total,
  coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as expense_total
from miclub.v_movements_enriched
where club_id = :club_id
  and source_payload->>'sheet' = 'ADMINISTRACIÓN';

rollback;
```

### 2. Pendientes administrativos de control

```sql
begin;

select
  operational_status,
  financial_status,
  count(*) as movements,
  coalesce(sum(case when movement_type = 'INGRESOS' then amount else 0 end), 0) as pending_income,
  coalesce(sum(case when movement_type = 'EGRESOS' then amount else 0 end), 0) as pending_expenses
from miclub.v_movements_enriched
where club_id = :club_id
  and source_payload->>'sheet' = 'ADMINISTRACIÓN'
  and (
    operational_status = 'PENDIENTE'
    or financial_status = 'pending'
  )
group by operational_status, financial_status
order by movements desc;

rollback;
```

### 3. Último corte de saldos operativos

```sql
begin;

select cutoff_date, liquidity, cash, bank, dollars, created_at, updated_at
from miclub.operational_balances
where club_id = :club_id
order by cutoff_date desc, created_at desc
limit 5;

rollback;
```

### 4. Detección de procedencia administrativa incompleta

```sql
begin;

select
  source_payload->>'sheet' as sheet_name,
  count(*) as movements,
  min(movement_date) as first_movement_date,
  max(movement_date) as last_movement_date
from miclub.movements
where club_id = :club_id
group by source_payload->>'sheet'
order by movements desc nulls last;

select id, movement_date, movement_type, category, concept, amount, source_payload
from miclub.movements
where club_id = :club_id
  and (source_payload->>'sheet' is null or source_payload->>'sheet' = '')
order by movement_date desc nulls last, id desc
limit 50;

rollback;
```

### 5. Plantilla de remediación manual excepcional

```sql
begin;

-- Reemplazar por el identificador exacto aprobado en ticket operativo.
update miclub.movements
set source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object(
      'sheet', 'ADMINISTRACIÓN',
      'manualRemediationTicket', :ticket_id,
      'manualRemediationAt', now(),
      'manualRemediationBy', current_user
    ),
    updated_at = now()
where club_id = :club_id
  and id = :movement_id
  and (source_payload->>'sheet' is null or source_payload->>'sheet' = '');

select id, source_payload, updated_at
from miclub.movements
where club_id = :club_id
  and id = :movement_id;

-- Cambiar a commit sólo con aprobación explícita y backup verificado.
rollback;
```

## Rollback

### Principios

- Preferir rollback por despliegue y migración versionada; evitar escrituras manuales directas.
- Todo cambio de datos debe tener backup, ticket, responsable, SQL exacto, conteo de filas esperado y validación posterior.
- Si una fase no cumple criterios, detener avance y mantener el panel en el último modo seguro aprobado.

### Por fase

- **Fase 0:** no requiere rollback funcional si sólo se ejecutan consultas `rollback`; cualquier hallazgo se documenta sin modificar datos.
- **Fase 1:** revertir PR de frontend/API read-only y mantener endpoint actual o shell anterior; no hay rollback de datos.
- **Fase 2:** deshabilitar permisos de escritura, revocar sesiones afectadas si corresponde, revertir despliegue y aplicar scripts inversos sólo si están aprobados por ticket.
- **Fase 3:** si falla cierre/conciliación, deshabilitar creación de cierres nuevos, conservar cierres existentes como evidencia y aplicar reapertura controlada en entorno aprobado.
- **Fase 4:** ejecutar rollback del release, validar que flags import/debug/bootstrap permanezcan apagadas, restaurar backup sólo si hubo corrupción confirmada y aprobada.

### Validación post-rollback

1. Login y autorización funcionan para usuarios válidos.
2. Usuarios sin permiso administrativo reciben rechazo esperado.
3. Conteos y saldos coinciden con baseline pre-cambio.
4. No hay filas huérfanas ni auditorías incompletas.
5. El incidente queda documentado con causa raíz y prevención.

## Riesgos

| Riesgo | Impacto | Probabilidad | Señal de alerta | Mitigación |
| --- | --- | --- | --- | --- |
| Mezcla de datos entre tenants | Crítico | Baja-media | Consultas sin filtro `club_id` o pruebas multi-tenant fallidas | Tenant sólo desde sesión, tests de aislamiento y revisión SQL obligatoria |
| Reintroducción de Sheets como read path | Alto | Media | Dependencias runtime a rangos de Sheets en consultas del panel | Mantener Sheets sólo como importación temporal y apagar flags fuera de ventana |
| Correcciones manuales sin auditoría | Alto | Media | Updates directos sin ticket ni motivo | Permisos granulares, auditoría antes/después y bloqueo de SQL manual no aprobado |
| Saldos inconsistentes por estados mal normalizados | Alto | Media | Diferencias entre tarjetas y SQL de control | Catálogo de reglas, diagnósticos periódicos y pruebas con fixtures reales |
| Edición sobre períodos cerrados | Alto | Media | Movimientos modificados después del cierre | Modelo de cierre, bloqueo por período y reapertura con doble autorización |
| Exportación con datos sensibles | Alto | Media | Reportes sin filtros de tenant o exceso de columnas | Permiso específico, minimización de columnas y pruebas de autorización |
| Degradación de performance | Medio | Media | Timeouts al filtrar movimientos históricos | Índices revisados, paginación obligatoria y planes SQL antes de producción |
| Rollback incompleto | Alto | Baja-media | Revert de código sin revert de permisos/datos | Runbook por fase, backups verificados y validación post-rollback |
| Operación con flags peligrosas encendidas | Alto | Baja | Import/debug/bootstrap activos tras despliegue | Checklist final y verificación automática de variables |
| Ambigüedad de reglas administrativas | Medio | Media | Usuarios interpretan distinto pendientes/caja/banco/dólares | Manual operativo, tooltips de cálculo y trazabilidad a movimientos fuente |
