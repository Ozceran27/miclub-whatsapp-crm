# Plan de entrega incremental del onboarding

Este documento ordena el trabajo pendiente en cortes pequeños, reversibles y
desplegables. No es evidencia de que un corte haya sido aplicado: cada fase se
considera terminada sólo cuando se adjuntan los resultados de sus gates en el
registro del despliegue.

## Principios de ejecución

- Cada corte debe mantener compatibles la versión anterior y la siguiente de
  API, frontend y esquema. Primero se expande el contrato y la base; el consumo
  nuevo y la eliminación de compatibilidad ocurren en despliegues posteriores.
- Las migraciones son únicamente aditivas. Los backfills se ejecutan de forma
  acotada y reanudable; los `NOT NULL`, claves foráneas y demás constraints se
  validan después de demostrar que no quedan filas incompatibles.
- Una fase no empieza a consumir artefactos de la siguiente. Sus criterios de
  salida son condiciones de entrada obligatorias para el corte posterior.
- Los flags nacen apagados. Activarlos, observarlos y revertirlos no requiere un
  nuevo binario ni una migración destructiva.
- Cada despliegue registra versión, migraciones aplicadas, estado de flags,
  resultados de validación y responsable de la decisión de promoción.

## Secuencia y cortes desplegables

### 1. Fase crítica: restaurar el recorrido mínimo

**Objetivo:** hacer confiable el alta de un club antes de ampliar el dominio.

1. **1A — Navegación:** corregir `GET /api/modules/navigation` para resolver
   exclusivamente módulos, capacidades y sectores persistidos del tenant de la
   sesión. Agregar casos sin sectores, con sectores y con dos tenants.
2. **1B — Enums:** inventariar valores persistidos, contratos compartidos,
   validadores y comparaciones del frontend. Registrar para cada enum el valor
   canónico, aliases temporales, propietario y estrategia de retiro; no cambiar
   valores en producción durante esta auditoría.
3. **1C — Recorrido crítico:** extender el gate de base vacía para cubrir, por
   rutas reales, registro, login, `/auth/me` y `/api/modules/navigation`. Debe
   probar que el club nuevo sólo recibe su navegación y que cerrar sesión anula
   el acceso.

**Gate de salida:** pruebas unitarias de navegación y el recorrido PostgreSQL
registro-login-navegación en verde. Cualquier respuesta cruzada entre tenants
bloquea el resto de la entrega.

### 2. Fase de dominio: cerrar decisiones antes del esquema

**Objetivo:** convertir decisiones de producto ambiguas en un vocabulario
aprobado y versionable, sin cambios de runtime.

Publicar una decisión explícita para cada punto:

- taxonomía única de planes y transición de aliases históricos;
- modelo de remuneración del personal y unidad/moneda de cada importe;
- frecuencias económicas de actividades y reglas de prorrateo;
- roles o membresías elegibles como responsables, siempre dentro del tenant;
- ciclo de vida de fotos, tipos y tamaño admitidos, almacenamiento privado,
  autorización de lectura, retención y borrado.

La aprobación debe incluir ejemplos válidos e inválidos, valor por defecto,
regla para datos existentes y responsable de producto. Los catálogos aprobados
se congelan para las fases 3 y 4; un cambio posterior abre una nueva versión de
contrato, no una edición silenciosa.

**Gate de salida:** decisiones firmadas por Producto, Backend, Datos y Seguridad;
matriz de enums sin términos duplicados ni campos sin semántica.

### 3. Fase de base de datos: expandir, rellenar y validar

**Objetivo:** preparar PostgreSQL sin obligar todavía a los consumidores a usar
los campos nuevos.

1. **3A — Expansión:** crear migraciones aditivas para columnas, tablas,
   índices y catálogos. Las columnas nuevas comienzan anulables o con defaults
   compatibles. Actualizar el manifiesto de migraciones.
2. **3B — Backfill:** rellenar por lotes, con métricas de filas pendientes,
   inválidas y procesadas. Reejecutar debe ser seguro.
3. **3C — Constraints:** crear constraints costosos como `NOT VALID`, comprobar
   el diagnóstico read-only y validarlos sólo cuando el backfill llega a cero.
4. **3D — Install gates:** probar instalación desde cero y upgrade desde una
   copia representativa; verificar RLS, grants y aislamiento tenant.

Para cada migración documentar rollback operativo. En una expansión, el
rollback preferido es desactivar consumidores y volver al binario anterior sin
eliminar datos; cualquier DDL inverso se reserva para una ventana posterior y
requiere backup verificado. El diagnóstico read-only no puede modificar tablas,
tomar locks exclusivos ni ejecutarse con el rol de runtime.

**Gate de salida:** manifiesto, instalación limpia, upgrade, backfill,
constraints, RLS y reporte read-only en verde; backup y procedimiento de
reversión ensayados en una base descartable.

### 4. Fase contractual: publicar antes de consumir

**Objetivo:** hacer compatibles ambas versiones durante un despliegue mixto.

1. Agregar enums, DTO y schemas versionados en `packages/shared`.
2. Actualizar validadores de entrada y salida de la API con errores de dominio
   estables; rechazar identificadores de responsables de otro tenant.
3. Incorporar adaptadores temporales que lean el formato anterior y el nuevo,
   pero escriban únicamente el canónico. Medir todo uso de aliases.
4. Publicar backend compatible y comprobar que el frontend anterior continúa
   funcionando. Sólo después habilitar el consumo en el frontend nuevo.

**Gate de salida:** pruebas de contrato y compatibilidad hacia atrás en verde,
telemetría de aliases disponible y fecha/condición de retiro documentada.

### 5. Fase de backend: invariantes transaccionales

**Objetivo:** concentrar reglas y efectos laterales en servicios observables y
seguros ante reintentos.

Entregar por separado: (a) finalización en una única transacción, (b) clave de
idempotencia y replay de la misma respuesta, (c) cálculo de capabilities desde
la suscripción efectiva, (d) subida privada mediante referencias opacas y URLs
de lectura efímeras, y (e) auditoría de cambios sensibles. Archivos no se hacen
públicos ni se confía en nombre, MIME o extensión enviados por el cliente.

Probar rollback en cada punto de fallo, dos solicitudes concurrentes con la
misma clave, rechazo de una clave reutilizada con otro payload, y ausencia de
capacidades para planes pendientes de pago.

**Gate de salida:** no hay escrituras parciales ni duplicadas; autorización de
archivos y auditoría pasan pruebas entre tenants; métricas permiten distinguir
éxito, replay, conflicto y rollback.

### 6. Fase de interfaz: revelar funcionalidad por cortes

**Objetivo:** sustituir el onboarding sin un cambio monolítico.

1. **6A:** compactar el contenedor, foco, progreso y acciones persistentes.
2. **6B:** reconstruir bienvenida y resumen con lenguaje del dominio aprobado.
3. **6C:** habilitar editores de sectores, actividades, personal y responsables
   usando los contratos publicados en la fase 4.
4. **6D:** integrar migración en dry-run y corrección de errores.
5. **6E:** conectar finalización idempotente, estados de espera, replay y
   recuperación de errores.

Cada corte debe ser navegable por teclado, conservar foco al cambiar de paso,
anunciar errores, respetar reduced motion y funcionar sin zoom CSS. La versión
nueva permanece detrás de un flag hasta superar accesibilidad y responsive.

**Gate de salida:** recorrido completo con teclado y lector de pantalla, sin
pérdida de borradores al retroceder ni doble envío al finalizar.

### 7. Fase de convergencia: una sola edición del dominio

**Objetivo:** evitar que onboarding y Administración diverjan.

Extraer catálogos, schemas, normalizadores y formularios comunes antes de
reemplazar las pantallas administrativas. Verificar crear en onboarding,
visualizar en Administración, editar allí, volver a abrir y conservar todos los
campos, incluyendo valores desconocidos de versiones futuras.

**Gate de salida:** pruebas de ida y vuelta sin pérdida para sectores,
actividades, personal, responsables y fotos; no existen catálogos duplicados en
el frontend.

### 8. Fase QA: matriz de promoción

Ejecutar unitarias, contratos, integración PostgreSQL, instalación/upgrade,
aislamiento tenant y el recorrido E2E. En Chrome al 100% ejecutar accesibilidad,
teclado, responsive y regresión visual en las resoluciones de
`ui-regression-checklist.md`. Clasificar diferencias visuales; no actualizar
baselines para ocultar una regresión.

**Gate de salida:** cero fallos, cero violaciones críticas/serias de
accesibilidad, cero escapes entre tenants y evidencia adjunta por viewport.

## Promoción controlada

### 9. Staging

1. Crear backup y ejecutar primero el diagnóstico read-only.
2. Aplicar migraciones y ejecutar los install gates y el diagnóstico posterior.
3. Desplegar contratos/backend con ambos flags apagados.
4. Activar gradualmente `ONBOARDING_PAID_PLAN_SELECTION_ENABLED` para selección
   libre de planes. La selección paga conserva `pending_payment` hasta una
   activación real y no concede capabilities anticipadamente.
5. Introducir un flag independiente para subida de fotos, apagado por defecto;
   activarlo sólo después de comprobar bucket privado, autorización, límites,
   borrado y observabilidad.
6. Validar el recorrido completo con un club nuevo y uno existente, incluida la
   edición posterior en Administración. Desactivar cada flag prueba la
   reversión funcional sin pérdida de datos.

Una migración aplicada no implica que el flag deba activarse. Ante errores se
apagan flags, se vuelve al binario compatible y se conserva el esquema
expandido para el análisis.

### 10. Producción

Promover exactamente los artefactos y checks aprobados en staging, sin
reconstruirlos. Repetir diagnóstico pre/post, migraciones y smoke tests con los
flags apagados; habilitar por cohortes pequeñas con monitoreo de errores,
latencia, conflictos idempotentes, denegaciones de archivos y auditoría.

La promoción final requiere aprobación explícita después de completar el
recorrido con un club nuevo y un club existente. Si falla cualquier recorrido,
aislamiento tenant o reconciliación de datos, se detiene la promoción y se
ejecuta el rollback operativo documentado.

## Comandos mínimos de evidencia

Ejecutar desde la raíz y guardar salida, commit y entorno. Las suites destructivas
usan exclusivamente una instancia PostgreSQL descartable cuyo nombre identifique
claramente el entorno de prueba.

```bash
npm run lint -ws
npm run deadcode
npm run typecheck
npm run build
npm run test -ws --if-present
npm run db:migrations:check
MIGRATION_GATE_DATABASE_URL=postgres://postgres:postgres@localhost/postgres npm run db:migrations:integration
MIGRATION_GATE_DATABASE_URL=postgres://postgres:postgres@localhost/postgres npm run db:tenant-isolation:integration
MIGRATION_GATE_DATABASE_URL=postgres://postgres:postgres@localhost/postgres npm run db:public-registration:integration
MICLUB_TEST_DATABASE_URL=postgres://postgres:postgres@localhost/miclub_test npm run test:integration:empty-db -w @miclub/api
```

Además de estos comandos, la evidencia manual debe identificar navegador,
versión, zoom 100%, viewport, club nuevo, club existente y estado de cada flag.
