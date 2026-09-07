# miClub Gestión — AGENTS.md

## 1. Propósito del proyecto

miClub Gestión es una aplicación SaaS multi-tenant orientada a la gestión administrativa, económica, financiera y operativa de clubes, complejos deportivos y organizaciones similares.

La aplicación debe permitir, entre otras funciones:

- registro de usuarios;
- creación y configuración de clubes;
- multi-tenancy;
- roles y permisos;
- onboarding inicial;
- sectores;
- trabajadores;
- instructores;
- actividades;
- movimientos;
- inscripciones;
- pagos;
- cuotas;
- saldos;
- liquidaciones;
- economía;
- CRM;
- administración;
- migración/importación XLSX;
- futura gestión de planes y funcionalidades.

PostgreSQL es la fuente de verdad operacional.

Google Sheets no debe utilizarse como runtime ni como fuente de verdad.

El XLSX solamente puede utilizarse como formato controlado de importación histórica.

---

## 2. Rol de Codex

Codex actúa como equipo de ingeniería del proyecto.

Debe:

- inspeccionar el repositorio antes de modificarlo;
- respetar la arquitectura actual;
- detectar implementaciones existentes antes de crear nuevas;
- mantener coherencia entre backend, frontend, shared y PostgreSQL;
- implementar cambios de forma pequeña y revisable;
- ejecutar tests relevantes;
- documentar cambios estructurales;
- reportar riesgos y regresiones.

Codex NO debe asumir que una propuesta antigua sigue vigente si contradice el código actual.

El repositorio actual y la documentación marcada como canónica son la autoridad principal.

---

## 3. Orden de lectura obligatorio

Antes de realizar cambios relevantes, leer:

1. `AGENTS.md`
2. `docs/project/PROJECT_CONTEXT.md`
3. `docs/project/CURRENT_STATE.md`
4. `docs/project/ARCHITECTURE.md`
5. `docs/project/BUSINESS_RULES.md`
6. `docs/project/DECISIONS.md`
7. documentación específica del dominio afectado

Si la tarea es pequeña y localizada, leer al menos:

- `AGENTS.md`
- `CURRENT_STATE.md`
- documentación del dominio afectado.

---

## 4. Fuente de verdad por tipo de información

### Implementación real
Repositorio actual.

### Estado actual del proyecto
`docs/project/CURRENT_STATE.md`

### Arquitectura
`docs/project/ARCHITECTURE.md`

### Reglas de negocio
`docs/project/BUSINESS_RULES.md`

### Decisiones arquitectónicas
`docs/project/DECISIONS.md`

### Roadmap
`docs/project/ROADMAP.md`

### Testing
`docs/project/TESTING.md`

### Historial Git
Fuente de verdad de cambios implementados.

---

## 5. Principios arquitectónicos

### Multi-tenancy

Toda entidad tenant-owned debe estar relacionada con un club de forma directa o demostrable.

El tenant se deriva de:

authenticated user
→ membership
→ club

Nunca confiar en `club_id` enviado desde frontend como autoridad.

Nunca implementar:

- first club fallback;
- fixed club UUID;
- default tenant global;
- query sin tenant scope para entidades tenant.

---

## 6. Personas, usuarios y relaciones

Evitar duplicar identidades.

La arquitectura debe distinguir correctamente:

- Person;
- User;
- Membership;
- Worker/Employee;
- Instructor;
- Enrollment.

No crear una segunda entidad de persona para resolver un caso de uso.

Un usuario puede tener roles dentro de un club mediante membership.

Un trabajador/instructor creado por el flujo actual puede tener User y acceso autenticable según el diseño vigente.

---

## 7. Sectores

Los sectores operativos son dinámicos y tenant-scoped.

Los sectores de sistema deben identificarse por código estable, no por nombre textual.

Actualmente los sectores obligatorios de sistema son:

- Administración;
- Tesorería;
- Áreas Comunes.

No usar nombres de sectores como lógica financiera o de negocio.

Los templates de sectores son globales si el modelo actual así lo define.

---

## 8. Actividades

Una actividad pertenece a un club y a un sector.

Debe tener responsable válido dentro del mismo tenant.

La configuración económica de una actividad no debe depender de nombres, planillas ni constantes hardcodeadas.

Modalidades principales:

- FIXED
- VARIABLE

En VARIABLE:
`club_share_percentage` representa siempre el porcentaje correspondiente al club.

Parte del responsable:
`100 - club_share_percentage`.

Evitar campos ambiguos llamados simplemente `commission`.

---

## 9. Configuración económica histórica

Los términos económicos de una actividad no deben alterar retrospectivamente la historia.

Si la arquitectura implementa términos versionados:

- respetar `effective_from`;
- respetar `effective_to`;
- calcular cada período usando la configuración vigente en ese período.

No reemplazar historia con configuración actual.

---

## 10. Saldo a Liquidar

Debe derivarse de PostgreSQL y de relaciones explícitas.

No utilizar Google Sheets.

### VARIABLE

Saldo del responsable:

completed operational income
× responsible share
-
settlements/pagos ya realizados.

Ejemplo obligatorio:

Ingresos: 100000
Club: 40%
Responsable: 60%
Pagado: 20000
Saldo: 40000

### FIXED

Saldo:

completed operational income
-
fixed monthly club fee
-
settlements/pagos ya realizados.

Ejemplo obligatorio:

Ingresos: 500000
Fixed fee club: 150000
Pagado: 30000
Saldo: 320000

No considerar automáticamente cualquier egreso de actividad como liquidación.

Las liquidaciones deben poder distinguirse explícitamente.

---

## 11. Movimientos

Los movimientos son la fuente financiera principal.

Tipos:

- INGRESO
- EGRESO
- CAPITAL

Los cálculos financieros ordinarios deben usar movimientos:

`status = COMPLETADO`

salvo excepciones explícitas.

Ejemplo:

Saldos Pendientes puede utilizar PENDIENTE.

No duplicar fórmulas financieras en frontend.

---

## 12. Categorías

Las categorías son un catálogo canónico de producto.

No crear listas distintas en frontend, backend y SQL.

Usar una única fuente.

Clasificaciones generales:

- OPERATIVE
- NON_OPERATIVE
- TAX
- SERVICE
- LIABILITY

No permitir doble conteo en agregados.

---

## 13. Inscripciones

Las inscripciones deben estar relacionadas con:

- club;
- person;
- sector;
- activity;
- status;
- fee;
- sequence/source según implementación vigente.

No usar DNI, nombre o datos importados como PK.

---

## 14. Identificadores

Preservar UUID como PK técnica si el modelo actual lo utiliza.

Los números incrementales de negocio deben:

- ser únicos dentro del tenant;
- ser concurrency-safe;
- no depender de datos importados;
- no usar `MAX()+1` sin protección.

---

## 15. XLSX / Migración

La migración universal debe seguir:

download template
→ upload
→ validate
→ dry-run
→ import real

El XLSX no contiene autoridad tenant.

El club se deriva de la sesión.

Matching permitido:

- trim;
- case normalization;
- accent normalization;
- Unicode normalization;
- normalized spacing.

Evitar fuzzy matching peligroso.

Errores de referencia deben bloquear import real.

---

## 16. Google Sheets

Google Sheets NO debe ser utilizado por runtime.

No agregar:

- Google Sheet IDs;
- ranges;
- service account flows;
- sync automático;
- fallback a Sheets.

Código histórico de Sheets solo puede mantenerse si está claramente aislado y todavía existe una razón documentada.

---

## 17. Roles y permisos

Separar:

### RBAC
Qué puede hacer un usuario dentro del club.

### Plan/Feature
Qué funcionalidades tiene contratadas el club.

No mezclar roles con planes.

El backend siempre debe aplicar autorización.

Ocultar un botón en frontend no constituye seguridad.

---

## 18. Planes

La arquitectura debe quedar preparada para:

- 1 plan gratuito;
- 3 planes pagos.

No implementar billing completo sin requerimiento.

Preferir conceptos como:

- plan;
- feature;
- entitlement;
- subscription.

Durante desarrollo pueden existir features habilitadas globalmente.

---

## 19. Onboarding

El onboarding es persistente.

Debe contemplar:

1. Bienvenida.
2. Saldos.
3. Sectores.
4. Trabajadores/Instructores.
5. Actividades.
6. Migración.
7. Finalización.

No depender solamente de:

movements = 0 AND enrollments = 0.

Debe existir estado persistente para evitar loops.

---

## 20. PostgreSQL

PostgreSQL es la fuente de verdad.

Antes de agregar tablas o columnas:

- inspeccionar schema;
- inspeccionar migrations;
- buscar implementación equivalente.

No crear schema duplicado.

Todo cambio estructural nuevo debe quedar versionado.

---

## 21. SQL real

Regla crítica:

SQL destinado a la base real del usuario debe ser entregado para ejecución manual mediante DBeaver.

Codex NO debe ejecutar SQL destructivo automáticamente contra la DB real.

Los scripts deben ser:

- completos;
- comentados;
- reproducibles;
- seguros;
- con preconditions;
- con post-validation;
- con rollback cuando corresponda.

---

## 22. Tests

Antes de finalizar una tarea:

- ejecutar tests relevantes;
- ejecutar typecheck;
- ejecutar build;
- ejecutar lint si existe.

No inventar comandos.

Inspeccionar `package.json` y scripts reales.

Toda corrección de bug importante debe incluir test de regresión cuando sea razonable.

---

## 23. Tests multi-tenant

Para cambios tenant-sensitive, verificar:

Club A no puede:

- leer Club B;
- modificar Club B;
- eliminar Club B;
- usar sector B;
- usar activity B;
- usar worker/instructor B;
- importar contra B.

---

## 24. Cambios pequeños

Evitar mega-refactors.

Preferir:

- un dominio por tarea;
- 5–12 archivos sustanciales;
- commit temático;
- tests específicos.

Si el cambio requiere muchos archivos, dividirlo.

---

## 25. Código duplicado

Antes de crear:

- service;
- repository;
- hook;
- validator;
- helper;
- calculation;
- DTO;
- enum;

buscar primero una implementación existente.

No mantener dos implementaciones activas del mismo comportamiento.

---

## 26. Frontend

No duplicar lógica de negocio.

Frontend debe:

- consumir contratos;
- renderizar datos;
- validar UX;
- manejar estados.

Backend/DB son autoridad para reglas críticas.

Mantener coherencia visual con la app actual.

No rediseñar módulos completos sin requerimiento.

---

## 27. React Query

Query keys deben ser tenant-safe.

Mutaciones deben invalidar queries relacionadas.

Logout debe limpiar/inutilizar cache sensible.

No permitir datos de un tenant luego de cambiar sesión.

---

## 28. Seguridad

Revisar siempre:

- password hashing;
- authorization;
- tenant;
- SQL parametrizado;
- mass assignment;
- IDOR;
- CORS;
- cookies;
- uploads;
- secrets;
- logs.

Nunca loguear passwords, hashes, tokens o secretos.

---

## 29. Documentación

Cuando una tarea cambie:

- arquitectura;
- regla de negocio;
- contrato;
- schema;
- flujo operativo;

actualizar documentación relevante.

No generar documentos duplicados.

---

## 30. Antes de modificar código

Para tareas medianas/grandes:

1. `git status`
2. identificar branch actual
3. inspeccionar archivos afectados
4. revisar docs
5. localizar implementación existente
6. planear diff
7. implementar
8. tests
9. reportar cambios

No tocar archivos fuera de alcance sin motivo.

---

## 31. Al finalizar cada tarea

Reportar:

- resumen;
- archivos modificados;
- DB changes;
- SQL generado;
- tests ejecutados;
- resultado de build/typecheck;
- riesgos;
- tareas pendientes;
- documentación actualizada.

Si existe un problema no resuelto, declararlo.

No afirmar “completo” si quedan blockers.

---

## 32. Regla de coherencia

Ante contradicción entre:

- conversación antigua;
- documentación vieja;
- implementación actual;

priorizar:

1. código actual validado;
2. documentación canónica actualizada;
3. decisión explícita reciente;
4. historial antiguo solo como referencia.

No reconstruir lógica obsoleta por accidente.

## Local PostgreSQL audit access

A local PostgreSQL read-only audit connection may be available through:

`AUDIT_DATABASE_URL`

This connection is intended exclusively for inspection of the real local
development database.

Before querying it, verify:

```sql
SELECT current_user;
SHOW transaction_read_only;