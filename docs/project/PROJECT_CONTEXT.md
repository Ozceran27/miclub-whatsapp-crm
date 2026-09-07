# Project Context

## Producto

**miClub Gestión** es una aplicación SaaS multi-tenant para la gestión administrativa, económica, financiera y operativa de clubes, complejos deportivos y organizaciones similares.

El producto evolucionó desde una herramienta interna vinculada a una planilla administrativa hacia una aplicación independiente, configurable y preparada para ser utilizada por múltiples clubes sin conocimiento previo de la estructura histórica de miClub.

## Objetivo de producto

Un club nuevo debe poder:

1. Registrarse públicamente.
2. Crear su usuario y su club.
3. Iniciar sesión.
4. Completar la configuración inicial.
5. Definir sectores, trabajadores/instructores y actividades.
6. Registrar movimientos, inscripciones, cuotas y demás operaciones.
7. Consultar Inicio, Economía, Administración y CRM.
8. Importar historia desde una plantilla XLSX estándar cuando su plan lo habilite.
9. Operar exclusivamente con PostgreSQL como fuente de verdad.

## Usuarios principales

- Director del club.
- Administradores.
- Trabajadores.
- Instructores/profesores.
- Futuros perfiles de acceso limitado.

## Capacidades principales

- Registro público y provisioning de club.
- Autenticación, sesión y logout.
- Multi-tenancy.
- Memberships, roles y permisos.
- Onboarding persistente.
- Sectores.
- Trabajadores/instructores.
- Actividades y términos económicos.
- Movimientos.
- Inscripciones.
- Pagos y cuentas a cobrar.
- Liquidaciones.
- Inicio y dashboards.
- Economía.
- Administración.
- CRM.
- Importación XLSX.
- Base para planes y features.

## Principios de producto

- PostgreSQL es la fuente operacional autoritativa.
- Un club no debe depender de nombres, IDs o reglas de miClub.
- Toda lógica tenant debe estar aislada por club.
- Google Sheets no forma parte del runtime.
- El XLSX es un formato de importación controlado, no una fuente viva.
- Las reglas financieras deben ser determinísticas y auditables.
- El frontend no debe duplicar lógica financiera del backend.
- La aplicación debe arrancar y permitir registro aun con cero clubes tenant.

## Rol del usuario/director del proyecto

La persona usuaria de este repositorio actúa como **Director del proyecto**:

- define objetivos;
- aprueba reglas de negocio;
- prioriza etapas;
- decide alcance;
- revisa planes;
- ejecuta manualmente SQL sobre la base real mediante DBeaver cuando corresponde.

Codex actúa como equipo de ingeniería y debe inspeccionar, implementar, testear y reportar sin sustituir decisiones de producto no resueltas.
