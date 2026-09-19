# Diagnósticos manuales

El diagnóstico histórico de liquidaciones se conserva en
[`../../activity-settlements-historical-diagnostic.sql`](../../activity-settlements-historical-diagnostic.sql)
para no modificar el checksum de la migración que referencia esa ruta.

Consultas y comprobaciones para inspección controlada. Ejecutar primero las
precondiciones de cada archivo y verificar que la conexión sea la esperada. Un
nombre `diagnostic` o `audit` no reemplaza la revisión del SQL antes de ejecutarlo.
