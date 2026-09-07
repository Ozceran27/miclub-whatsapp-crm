# Domain Model

Este documento describe el modelo conceptual observado/esperado. Los nombres exactos de tablas y columnas se validan contra migrations y PostgreSQL.

## Club

Tenant principal. Mantiene identidad, settings, subscription y onboarding.

## User

Identidad autenticable. Accede a clubes mediante Membership.

## Person

Perfil humano reutilizable por User, Employee, Instructor y Enrollment.

## Membership

```text
User ↔ Club
```

Define role, permisos, status y posible scope sectorial.

## Role

El provisioning actual crea roles por club a partir de definiciones compartidas.

## Permission

Capability de autorización. Código y DB deben permanecer reconciliados.

## Club Subscription

Relaciona Club con Plan. El provisioning observado asigna `FREE`.

## Plan / Feature

Códigos observados/documentados:

- FREE
- SOCIAL
- COMPLEX
- CLUB

`DATA_MIGRATION` es capability del importador.

## Club Onboarding

Estado persistente con status, current step y progreso completado/omitido.

## Sector

Entidad tenant. Tres sectores system iniciales:

- Administración
- Tesorería
- Áreas Comunes

## Sector Template

Catálogo global sugerido cuando exista en schema. No confundir con Sector tenant.

## Employee / Worker

Relación laboral de Person con Club. El Director se aprovisiona como employee.

## Instructor

Relación/rol especializado para responsables de actividades. No debe duplicar Person.

## Activity

Relaciona Club, Sector, Responsible/Instructor y Activity Terms.

## Activity Terms

Configuración económica con vigencia temporal: mode, porcentaje/fee, effective dates.

## Movement

Hecho financiero. Puede relacionar club, category, sector, activity, payment method, counterparty, source y status.

## Category Catalog

Catálogo global canónico.

## Movement Category

Asociación/configuración tenant derivada del catálogo global.

## Payment Method

Método de pago del club. Provisioning observado: Efectivo y Transferencia.

## Enrollment

Inscripción de Person a Activity dentro del tenant.

## Receivable / Payment

Dominio de deuda/cobro según implementación vigente.

## Activity Settlement

Liquidación de actividad/responsable basada en términos históricos.

## Settlement Allocation

Relaciona PAYMENT/ADVANCE con settlement; no fracciona un movimiento entre allocations activas.

## Task

Tarea administrativa tenant.

## Approval Request

Solicitud controlada por handlers validados.

## Import Batch / Import Error

Trazabilidad de importación XLSX.

## Audit Log

Registro de acciones relevantes sin secretos.
