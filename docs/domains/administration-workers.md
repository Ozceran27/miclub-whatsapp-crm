# Fuente de datos de trabajadores

`GET /api/administration/workers` usa `miclub.employees` cuando la tabla existe. La respuesta indica `dataSource: "employees"` y no incluye campos de autenticación ni consulta `password_hash`.

En instalaciones anteriores sin esa tabla, el endpoint se degrada a `miclub.people`, `miclub.instructors` y `miclub.user_club_memberships` (`dataSource: "legacy"`). En este modo:

- salario y fecha de ingreso no están disponibles;
- el rol se toma de la membresía y, si no existe, se infiere como “Instructor”;
- el sector se infiere de `sector_ids` o de las actividades del instructor;
- sólo aparecen personas vinculadas a una membresía o a un instructor.

Estas limitaciones también se entregan en `limitations` y se muestran en `WorkerList`.

## Contrato canónico desde 2026-09-21

- `employees.position` conserva `DIRECTOR`, `INSTRUCTOR` o `TRABAJADOR` aunque no
  exista membresía; con membresía, rol, permisos, sectores y acceso se sincronizan
  en la misma transacción.
- La edición exige `updatedAt` para evitar sobrescrituras concurrentes y devuelve
  la fila recargada en la consulta posterior.
- `contactEmail` pertenece a Person. `accountEmail` identifica la cuenta global y
  es informativo para el administrador del club; `accessEmail` sólo inicia un alta
  o invitación cuando aún no hay cuenta vinculada.
- Un trabajador no puede archivarse mientras sea responsable de una actividad
  vigente. Cambiar su rol no altera la responsabilidad de la actividad.
- Sector y trabajador se validan por `(id, club_id)`; una referencia de otro tenant
  se rechaza.
