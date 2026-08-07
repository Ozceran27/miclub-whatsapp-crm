# Reporte de mapeos

Los valores concretos se completan con la exportación de `01`; este documento no
inventa filas que no fueron observadas.

| Mapa | Clave primaria | Alternativa permitida | Ambiguo/prohibido |
|---|---|---|---|
| sector legacy → sector | `code` normalizado único | relación FK existente | nombre solo, fuzzy match |
| actividad legacy → activity | FK existente / código único por club | sector + nombre + modalidad exactos, revisión | nombre solo |
| persona | DNI normalizado | email o teléfono normalizados únicos | nombre/apellido automático |
| instructor | `instructors.person_id` | evidencia explícita persona/activity | texto profesor solo |
| categoría | alias explícito → ID canónico | nombre normalizado revisado | crear categoría por typo |
| medio de pago | alias explícito → ID canónico | nombre normalizado revisado | crear duplicado |

Los mapas temporales están deliberadamente vacíos en `04` y `10`: el operador
debe cargar únicamente decisiones respaldadas por la salida del diagnóstico. Los
scripts rechazan IDs inexistentes y asociaciones cross-tenant.
