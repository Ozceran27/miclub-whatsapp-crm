# Documentación de miClub Gestión

Este directorio separa fuentes vigentes, procedimientos operativos, referencias,
SQL manual y material histórico. El código y las migraciones versionadas siguen
siendo la autoridad de implementación. Para conocer el estado comprobado del
checkout, comenzar por [`project/CURRENT_STATE.md`](project/CURRENT_STATE.md).

## Estructura

| Carpeta | Contenido | Punto de entrada |
| --- | --- | --- |
| `project/` | Contexto canónico, estado, reglas, decisiones y roadmap | [`project/README.md`](project/README.md) |
| `architecture/` | Arquitectura desplegable, límites de runtime y migraciones | [`architecture/README.md`](architecture/README.md) |
| `domains/` | Reglas y funcionamiento por dominio | [`domains/README.md`](domains/README.md) |
| `imports/` | Contrato y operación del importador XLSX | [`imports/README.md`](imports/README.md) |
| `operations/` | Readiness, despliegue, RLS, retención y controles | [`operations/README.md`](operations/README.md) |
| `reference/` | Inventarios técnicos de consulta | [`reference/README.md`](reference/README.md) |
| `dbeaver/` | SQL manual, diagnósticos y procedimientos de base | [`dbeaver/README.md`](dbeaver/README.md) |
| `manual/` | Manual de usuario en formatos distribuibles | [`manual/README.md`](manual/README.md) |
| `history/` | Checkpoints, planes y auditorías sustituidos | [`history/README.md`](history/README.md) |

El archivo `activity-settlements-historical-diagnostic.sql` permanece en la raíz
porque su ruta forma parte del contenido de una migración ya publicada y, por lo
tanto, de su checksum. Los diagnósticos nuevos deben ubicarse en `dbeaver/diagnostics/`.

## Lectura recomendada

1. [`project/CURRENT_STATE.md`](project/CURRENT_STATE.md)
2. [`project/ARCHITECTURE.md`](project/ARCHITECTURE.md)
3. [`project/BUSINESS_RULES.md`](project/BUSINESS_RULES.md)
4. [`operations/pre-reset-readiness.md`](operations/pre-reset-readiness.md)
5. Documento del dominio afectado

Los runbooks y SQL describen procedimientos. Su presencia en Git no demuestra
que hayan sido ejecutados. PostgreSQL real sólo se modifica mediante el flujo
manual definido para DBeaver.

## Control de enlaces

Después de mover o renombrar documentación, ejecutar:

```bash
npm run docs:check
```

El control recorre todos los Markdown bajo `docs/` y falla si un enlace local no
resuelve a un archivo o directorio existente.
