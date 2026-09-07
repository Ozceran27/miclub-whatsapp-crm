# Onboarding

## Propósito

Configurar un club nuevo sin depender de datos históricos o Google Sheets.

## Backend observado

Existe `club_onboarding`; el provisioning crea `NOT_STARTED`, current step 1 y arrays de progreso.

Existen endpoints para read, advance, opening balances, fotos y complete. El draft tiene versión compartida.

## Flujo de producto objetivo

Walkthrough de 7 pantallas:

1. Bienvenida.
2. Cargar Saldos.
3. Configurar Sectores.
4. Configurar Trabajadores/Instructores.
5. Configurar Actividades.
6. Importación y Migración.
7. Configuración Finalizada.

## Regla de aparición

Club nuevo/vacío puede iniciar onboarding, pero `COMPLETED` impide loop aunque siga sin movimientos/inscripciones.

## Paso 1 — Bienvenida

No omisible. Explica la app y las configuraciones iniciales.

## Paso 2 — Saldos

No omisible. Requiere moneda, efectivo, cuenta corriente y USD/dólares según contrato vigente. Cero es válido.

Debe integrarse al ledger/movimientos auditables.

## Paso 3 — Sectores

Siempre existen system sectors:

- Administración
- Tesorería
- Áreas Comunes

Permite agregar sectores tenant desde catálogo/template cuando aplique.

## Paso 4 — Trabajadores/Instructores

Muestra Director inicial.

El objetivo de producto requiere crear person/user/membership/role/worker/instructor según elección, con compensación FIXED o VARIABLE.

El repo observado también contiene worker invitations: auditar el checkout local para confirmar el flujo final y evitar dos implementaciones paralelas.

## Paso 5 — Actividades

Configura icono, nombre, responsable, sector y términos económicos. Nested relations mismo tenant.

## Paso 6 — Migración

Informativa. La carga real se realiza luego en el módulo Migración si el plan lo habilita.

Advertir sobre doble contabilización entre opening balances y un historial que ya incluya CAPITAL inicial.

## Paso 7 — Finalización

Marca onboarding COMPLETED, refresca/invalida datos y habilita operación normal.

## Planes

La documentación actual maneja FREE, SOCIAL, COMPLEX y CLUB y también selección de plan durante onboarding.

Reconciliar localmente cómo encaja esa selección dentro de las siete pantallas sin inventar una octava etapa.

## Resiliencia

- progreso persistido;
- F5 seguro;
- reintentos idempotentes;
- errores locales;
- draft versionado;
- completar no duplica datos.
