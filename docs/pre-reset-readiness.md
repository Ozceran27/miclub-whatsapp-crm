# Readiness canónico previo al reset

**Vigencia:** 2026-08-16<br>
**Alcance:** contrato documental del repositorio para preparar el reset y el despliegue posterior.

Este es el único índice vigente de readiness. No certifica que una migración, un
script manual, un backup o una validación se hayan ejecutado en un entorno: ese
estado sólo existe cuando el ticket operativo conserva evidencia del entorno,
commit, operador y fecha. Las reglas y los procedimientos permanecen en sus
documentos especializados; este documento los enlaza sin reproducirlos.

## Fuentes que componen el gate

| Área | Fuente canónica | Uso en el gate |
| --- | --- | --- |
| Arquitectura y límites de runtime | [`architecture-current.md`](architecture-current.md) y [`runtime-boundaries.md`](runtime-boundaries.md) | Confirmar el contrato desplegable y las fuentes autoritativas. |
| Migraciones y ledger | [`migration-manifest-policy.md`](migration-manifest-policy.md) | Validar orden, identidad, checksums y evidencia del ledger; la presencia de SQL o de objetos no prueba aplicación. |
| Onboarding | [`onboarding.md`](onboarding.md) | Ejecutar la secuencia funcional canónica una vez preparado el schema. |
| Liquidaciones de actividades | [`business-rules/activity-settlement-allocations.md`](business-rules/activity-settlement-allocations.md) | Validar la invariantes de asignación y conciliación sin reinterpretarlas aquí. |
| Importación XLSX | [`import-xlsx.md`](import-xlsx.md) y [`migration/xlsx-v1.md`](migration/xlsx-v1.md) | Aplicar el flujo soportado, sus validaciones y trazabilidad de lote. |
| Despliegue, corte y rollback | [`deployment-runbook.md`](deployment-runbook.md) y [`postgres-cutover-runbook.md`](postgres-cutover-runbook.md) | Ejecutar procedimientos y registrar el resultado; un runbook no afirma que el paso ya ocurrió. |

El inventario de rutas de API se consulta en
[`api-route-inventory.md`](api-route-inventory.md). Los SQL de
[`dbeaver/`](dbeaver/README.md) son procedimientos manuales de diagnóstico o
remediación: su existencia en Git nunca se interpreta como estado aplicado ni
como sustituto del manifiesto.

## Criterio de decisión

El reset puede autorizarse únicamente cuando el ticket operativo enlaza evidencia
vigente para cada fuente del gate, incluida una restauración de backup probada,
el ledger comparado con el manifiesto, los checks automatizados del commit y los
smoke tests de autenticación y aislamiento tenant. Cualquier resultado ausente,
fechado para otro commit o inferido sólo desde el checkout queda **no verificado**
y bloquea la declaración de readiness; no se corrige reescribiendo el ledger ni
repitiendo SQL manual a ciegas.

Después del reset, se siguen los runbooks enlazados y se adjuntan sus salidas al
ticket. Las afirmaciones fechadas anteriores se conservan sólo para trazabilidad
en [`history/`](history/README.md) y no participan en una decisión nueva.
