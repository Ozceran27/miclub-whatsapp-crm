# Fuente de datos de trabajadores

La tabla administrativa muestra páginas de 20 trabajadores. Si la membresía posee `workers.view` y `finance:read`, consulta por separado los saldos devengados por persona y moneda. La lectura financiera sólo incluye sectores visibles para la membresía; un saldo incompleto o una falla de cálculo aparece como «No disponible». El permiso laboral por sí solo no expone importes.

`GET /api/administration/workers` usa `miclub.employees` cuando la tabla existe. La respuesta indica `dataSource: "employees"` y no incluye campos de autenticación ni consulta `password_hash`.

En instalaciones anteriores sin esa tabla, el endpoint se degrada a `miclub.people`, `miclub.instructors` y `miclub.user_club_memberships` (`dataSource: "legacy"`). En este modo:

- salario y fecha de ingreso no están disponibles;
- el rol se toma de la membresía y, si no existe, se infiere como “Instructor”;
- el sector se infiere de `sector_ids` o de las actividades del instructor;
- sólo aparecen personas vinculadas a una membresía o a un instructor.

Estas limitaciones también se entregan en `limitations` y se muestran en `WorkerList`.
El frontend deshabilita altas, ediciones y archivado en este modo; el backend
también falla cerrado con `WORKER_MODEL_NOT_APPLIED`.

## Contrato canónico desde 2026-09-21

- `employees.position` conserva `DIRECTOR`, `INSTRUCTOR` o `TRABAJADOR` aunque no
  exista membresía; con membresía, rol, permisos, sectores y acceso se sincronizan
  en la misma transacción.
- La edición y el archivado exigen `version`, un token opaco derivado de
  `employees.updated_at::text`. La igualdad se evalúa en PostgreSQL dentro de la
  transacción y preserva microsegundos; `updatedAt` queda sólo para presentación.
  Un conflicto conserva abierto el formulario y permite recargar la ficha.
- `contactEmail` pertenece a Person. `accountEmail` identifica la cuenta global y
  es informativo para el administrador del club; `accessEmail` sólo inicia un alta
  o invitación cuando aún no hay cuenta vinculada.
- Un trabajador no puede archivarse mientras sea responsable de una actividad
  vigente. Cambiar su rol no altera la responsabilidad de la actividad.
- Sector y trabajador se validan por `(id, club_id)`; una referencia de otro tenant
  se rechaza.
- La foto activa se marca para eliminar y sólo cambia al confirmar el formulario;
  cancelar conserva la foto persistida. Reemplazo/eliminación, relación laboral,
  identidad, membresía, rol, Instructor, remuneración y auditoría comparten la
  misma transacción.
- La vigencia de remuneración actual se muestra como dato. Sólo un cambio de
  activación, importe, moneda o frecuencia solicita `compensationEffectiveFrom` y
  crea/cierra términos históricos.
