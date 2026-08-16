# Documentación

## Fuente canónica vigente de readiness

- [`pre-reset-readiness.md`](pre-reset-readiness.md): índice único del gate previo al reset y de las fuentes especializadas que lo componen. No afirma que un procedimiento haya sido ejecutado.
- [`architecture-current.md`](architecture-current.md): arquitectura desplegable actual; remite al índice anterior para cualquier decisión de readiness.
- [`runtime-boundaries.md`](runtime-boundaries.md): límites del proceso productivo.
- [`legacy-runtime-inventory.md`](legacy-runtime-inventory.md): grafo, clasificación y puerta de eliminación de legado.
- [`import-xlsx.md`](import-xlsx.md): operación soportada de importación.
- [`deployment-runbook.md`](deployment-runbook.md): procedimiento de despliegue.
- [`postgres-cutover-runbook.md`](postgres-cutover-runbook.md): procedimiento de corte y reversión de datos.

Los runbooks y SQL manuales describen procedimientos. Su presencia, contenido o
marcas de checklist no constituyen evidencia de aplicación en ningún entorno.

## Evidencia forense e historia

Los diagnósticos fechados y las reconstrucciones de incidentes viven en
[`history/forensics/`](history/forensics/README.md). Sirven como evidencia de lo
observado en su fecha, pero no reemplazan las fuentes canónicas anteriores. Los
readiness y checkpoints sustituidos se catalogan en
[`history/`](history/README.md).
