# Arquitectura actual

## `mockData` legacy y uso permitido

`apps/api/src/data/mockData.ts` es un fallback legacy para mantener operables demos,
desarrollo local y pruebas manuales cuando no hay una fuente externa disponible. No debe
considerarse una fuente productiva ni una representación completa o autoritativa de socios,
pagos, saldos o plantillas.

El runtime puede responder con `syncStatus.source = "mock"` únicamente en escenarios de
fallback controlado:

- Google Sheets está desactivado para el entorno actual.
- Google Sheets está activado pero faltan credenciales.
- La sincronización contra Google Sheets falla y la API conserva una respuesta funcional para
  demo/desarrollo.

En producción, el origen esperado para datos operativos es PostgreSQL. Si una pantalla,
endpoint o prueba depende de `mockData`, esa dependencia debe tratarse como deuda legacy y
no como contrato productivo. No eliminar `mockData.ts` hasta confirmar que no se usa en
demos, desarrollo local o pruebas automatizadas/manuales.

Si se decide mover este archivo a `apps/api/src/legacy/mockData.ts`, hacerlo en una PR pequeña
que cambie solo imports relacionados y ejecutar typecheck completo para validar el alcance.
