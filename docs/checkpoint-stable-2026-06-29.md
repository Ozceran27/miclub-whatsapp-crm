# Checkpoint estable 2026-06-29: producción PostgreSQL

Este documento fija el estado estable declarado para la operación actual de MiClub CRM al 2026-06-29. Su objetivo es servir como referencia antes de futuras PRs, migraciones o refactors. No contiene secretos, credenciales ni valores reales de `.env`.

## Estado estable declarado

- La aplicación productiva está publicada en `https://gestion.meclub.com.ar`.
- PostgreSQL es la fuente oficial y autoritativa para datos operativos, socios, inscripciones, movimientos, saldos, reportes y auditoría.
- Google Sheets queda limitado a migración, importación controlada, conciliación puntual o compatibilidad legacy. No debe tratarse como fuente productiva oficial después del corte.
- El módulo **INICIO** debe operar con datos reales provenientes de PostgreSQL, no con datos mock, fixtures ni planillas como origen principal.
- El login está activo y forma parte del flujo productivo esperado.
- La migración Google Sheets → PostgreSQL está funcional y debe conservarse para dry-runs, auditoría, reimportaciones controladas y compatibilidad durante ventanas operativas.

## No tocar sin aprobación explícita

Estos componentes quedan marcados como sensibles. Cualquier cambio debe hacerse en PR chica, con validación previa y plan de rollback:

- **Cloudflare Tunnel**: no modificar rutas, dominios, túneles, DNS, certificados ni configuración de exposición pública sin coordinación operativa.
- **Login**: no desactivar, relajar ni saltar autenticación en producción; no cambiar flujos de sesión sin pruebas de acceso y salida.
- **Schema PostgreSQL**: no renombrar tablas, columnas, constraints, índices ni migraciones aplicadas sin migración versionada, backup y verificación de datos.
- **Datos reales**: no truncar, reseedear, sobrescribir ni anonimizar datos productivos desde scripts locales o fixtures.
- **Endpoints funcionales**: no cambiar contratos HTTP, payloads ni semántica de endpoints usados por web, importador, auditoría o integraciones sin inventario y compatibilidad.
- **Cálculos financieros**: no modificar reglas de ingresos, egresos, saldos, vencimientos, deuda, estado financiero ni agregaciones de dashboard sin casos de prueba y validación contra datos reales.

## Comandos de validación esperados

Antes de declarar estable una nueva PR sobre este checkpoint, ejecutar y revisar:

```bash
npm run typecheck
npm run build
npm run start
npm run import:sheets:dry
npm run audit:postgres
```

Notas:

- `npm run start` debe validarse contra la configuración productiva o staging correspondiente, sin imprimir secretos.
- `npm run import:sheets:dry` debe completar sin persistir cambios definitivos.
- `npm run audit:postgres` debe revisar consistencia de datos PostgreSQL después de migraciones o importaciones.

## Mapa breve de arquitectura actual

- **Web app**: frontend de gestión publicado en `https://gestion.meclub.com.ar`, con login activo y módulos operativos como INICIO/CRM consumiendo la API.
- **API**: backend Node/TypeScript que expone endpoints para la web, importación, auditoría y operaciones CRM.
- **PostgreSQL**: base autoritativa para entidades reales del negocio: personas/socios, inscripciones, movimientos financieros, sectores, actividades, instructores, saldos y estados.
- **Google Sheets**: origen histórico/legacy usado por scripts de importación y compatibilidad durante migraciones; no es el source of truth productivo.
- **Importador Sheets → PostgreSQL**: proceso CLI con modo dry-run y modo real para leer rangos definidos de Sheets, normalizar datos y persistirlos en PostgreSQL.
- **Auditoría PostgreSQL**: scripts de control para detectar inconsistencias, validar conteos y revisar resultados posteriores al corte.
- **Cloudflare Tunnel**: capa de exposición pública que conecta el dominio productivo con el servicio desplegado.

## Deuda técnica conocida

- Reducir dependencias legacy de Google Sheets hasta dejarlo solo como herramienta de importación/auditoría histórica.
- Eliminar o aislar usos residuales de datos mock/fixtures en pantallas productivas, especialmente en INICIO y reportes financieros.
- Consolidar documentación de endpoints y contratos para evitar cambios accidentales en consumidores existentes.
- Fortalecer pruebas automatizadas para cálculos financieros, estados de deuda, vencimientos y conciliaciones.
- Versionar y revisar cuidadosamente futuras migraciones PostgreSQL para proteger datos reales.
- Separar con mayor claridad configuración local, staging y producción sin exponer valores reales de `.env`.

## Política de secretos

Este checkpoint no debe incluir valores reales de `.env`, tokens, passwords, URLs privadas de base de datos, claves de Google, claves de sesión ni credenciales de Cloudflare. Los ejemplos futuros deben usar placeholders explícitos y seguros.
