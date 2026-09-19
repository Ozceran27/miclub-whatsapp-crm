# Análisis estático

ESLint se ejecuta con información de tipos y configuraciones separadas para API,
web y shared. La política prohíbe `console.log` y `console.debug`; `warn` y `error`
se toleran únicamente para compatibilidad mientras se migran a la abstracción de
logging estructurado. Los scripts de operación y los tests permiten salida de
consola porque son procesos interactivos, no código de aplicación.

Knip detecta exports, archivos y dependencias sin consumidores. Sus entrypoints
incluyen el servidor, el navegador, el paquete público, tests y scripts. Se
excluyen expresamente scripts operativos, migraciones, diagnósticos y tareas de
estabilización: se invocan fuera del grafo normal o por operadores. Un reporte de
Knip es una señal para verificar consumidores y contratos; nunca autoriza por sí
solo a eliminar adaptadores legacy.

Comandos:

- `npm run lint -ws`: reglas locales por workspace.
- `npm run deadcode`: análisis global con Knip.
- `npm run check`: lint, análisis de código muerto, tipos, build y tests.
