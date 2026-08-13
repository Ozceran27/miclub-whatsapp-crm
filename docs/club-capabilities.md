# Capabilities de club

Las funcionalidades de producto habilitadas para un tenant se resuelven exclusivamente desde
`miclub.club_capabilities`. Cada grant registra su fuente, actor y ventana de vigencia. El permiso
RBAC continúa siendo una condición independiente: `DATA_MIGRATION` no reemplaza `imports:run`.

Las rutas y la interfaz no deben inferir capabilities a partir del nombre de un plan. La asociación
futura entre planes comerciales y capabilities, incluidos altas, bajas y cambios de plan, pertenece
al módulo de **billing**. Billing deberá materializar esos cambios como grants explícitos y auditables;
el servicio central de capabilities sólo los consume.
