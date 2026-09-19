# Fuente de datos de trabajadores

`GET /api/administration/workers` usa `miclub.employees` cuando la tabla existe. La respuesta indica `dataSource: "employees"` y no incluye campos de autenticación ni consulta `password_hash`.

En instalaciones anteriores sin esa tabla, el endpoint se degrada a `miclub.people`, `miclub.instructors` y `miclub.user_club_memberships` (`dataSource: "legacy"`). En este modo:

- salario y fecha de ingreso no están disponibles;
- el rol se toma de la membresía y, si no existe, se infiere como “Instructor”;
- el sector se infiere de `sector_ids` o de las actividades del instructor;
- sólo aparecen personas vinculadas a una membresía o a un instructor.

Estas limitaciones también se entregan en `limitations` y se muestran en `WorkerList`.
