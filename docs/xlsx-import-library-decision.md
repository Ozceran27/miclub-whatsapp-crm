# Decisión de lectura XLSX segura

## Elección

Se evaluó **ExcelJS** como única librería XLSX mantenida para Node. Se descarta `xlsx`/SheetJS Community para evitar dos motores redundantes y porque su distribución y modelo de mantenimiento no encajan con el lockfile actual. ExcelJS es la elección para una fase posterior de mapeo semántico; no se agregó al corte porque el registro de paquetes del entorno rechazó la descarga y no se debe inventar un lockfile.

Este corte no evalúa fórmulas. La superficie de seguridad previa al parser se implementa sobre el contenedor Open Packaging Convention: límites comprimidos y expandidos, ratio, cantidad de entradas, paths, macros, enlaces externos, fórmulas, hojas y filas. Solo se observan valores almacenados. El parser semántico queda detrás de esa inspección y no se habilita Google Sheets.

## Aislamiento y retiro

El importador de Google Sheets permanece bajo `/api/import/google-sheets`, carga dinámica y `IMPORT_ENDPOINTS_ENABLED=true`. El nuevo flujo vive exclusivamente bajo `/api/migration`. No se comparan ni mezclan resultados en este corte; Google Sheets se retirará después de una comparación controlada.

## Aplicación y recuperación de la migración

`202608130004_secure_xlsx_import.sql` debe ejecutarse mediante `npm run db:migrate`, después de las migraciones de autenticación `202607250002` y `202607250003`. La primera renombra la tabla histórica `miclub.app_users` a la tabla canónica `miclub.users`; por eso `uploaded_by` referencia exclusivamente `miclub.users(id)`.

Si una ejecución manual de la versión anterior falló con `42P01`, PostgreSQL abortó el único `ALTER TABLE` que contenía la referencia inválida. No se debe insertar el nombre en `public.miclub_schema_migrations` ni modificar el ledger manualmente. Hay que confirmar primero que `to_regclass('miclub.users')` devuelve una relación y volver a ejecutar la migración corregida mediante el runner. La migración ahora es transaccional, usa operaciones idempotentes y emite un error explícito si falta su prerrequisito.
