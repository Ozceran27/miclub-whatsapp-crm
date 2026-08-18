# Reset controlado de tenants desde DBeaver

Este directorio contiene un procedimiento **manual y destructivo** para dejar la
base lista para un onboarding nuevo sin borrar catálogos ni el ledger de
migraciones. Está diseñado para PostgreSQL y debe ejecutarse con un rol DBA, en
una única conexión de DBeaver, con **Auto-commit desactivado** y `ON_ERROR_STOP`
(o «Stop on error») habilitado.

## Gate operativo

1. Crear y verificar un backup restaurándolo en una base descartable. Conservar
   URI/fecha/checksum y evidencia de la restauración en el ticket.
2. Ejecutar `01_pre_reset_audit.sql` completo. Exportar todos sus result sets,
   especialmente la matriz, `reset_global_fingerprints` y
   `reset_precheck_checks`. No continuar salvo
   que el último resultado sea `RESET PRECHECK: PASS`.
3. Revisar que las clasificaciones `UNKNOWN` estén justificadas. El reset se
   niega a borrar una tabla desconocida: reclasificar el caso en el script sólo
   después de revisar su semántica y guardar esa revisión.
4. En la **misma conexión**, ejecutar `02_tenant_reset.sql` inicialmente con el
   `ROLLBACK` final. El script exige las tablas temporales y el PASS de `01`; no
   copie resultados entre sesiones. Revisar
   los avisos y conteos. Cuando el ensayo sea correcto, cambiar **solamente** ese
   `ROLLBACK` por `COMMIT` y ejecutar de nuevo desde el principio.
5. Sin cerrar la conexión (la huella pre-reset es temporal), ejecutar
   `03_post_reset_validation.sql`; conservar todos los resultados. Un `FAIL`
   obliga a investigar o restaurar, nunca a insertar filas a mano.
6. Seguir `04_reset_rollback_notes.sql` para rollback/recuperación.

El UUID diagnóstico esperado es
`821893b6-01a8-4e91-88f7-d869d8f3f8f4`. El reset acepta sólo una base totalmente
vacía o un único tenant de desarrollo: un club, ese único usuario y una única
membership activa hacia el club. Personas y `club_memberships`, si la
tabla aún existe, deben estar explicadas íntegramente por ese mismo tenant; se
rechazan perfiles enlazados a identidades ajenas o una identidad enlazada a más
de un perfil. El primer result set del pre-audit muestra las filas inesperadas y
debe revisarse antes de continuar. `02_tenant_reset.sql` vuelve a contar las
cinco tablas inmediatamente antes de validar y borrar, y muestra esos conteos
como evidencia de la ejecución.

## Alcance y garantías

- Los nombres reales se descubren en los catálogos; no se presupone que todas
  las tablas estén en `miclub`.
- Nunca se usa `TRUNCATE CASCADE`.
- El reset deshabilita transaccionalmente sólo los guards
  `movements_reject_physical_delete` y `payments_reject_physical_delete`, porque
  la retención ordinaria impide borrar hechos financieros. Verifica primero su
  identidad/estado y los vuelve a habilitar antes de finalizar; nunca deshabilita
  triggers internos ni claves foráneas.
- `public.miclub_schema_migrations`, schemas de sistema y tablas clasificadas
  como `GLOBAL_STRUCTURAL`/`SYSTEM_INTERNAL` se conservan.
- Las huellas globales son conteo y digest determinista del contenido textual
  de cada fila. Se guardan en una tabla temporal de la conexión, no en la base.
- Los scripts no sustituyen el backup, la revisión humana ni el gate de
  readiness de [`../../pre-reset-readiness.md`](../../pre-reset-readiness.md).

## Qué ejecutar y cuándo

No ejecute los cuatro archivos como un lote. La secuencia tiene puntos de parada
obligatorios:

| Momento | Archivo | Acción |
| --- | --- | --- |
| Ahora, para diagnosticar | `01_pre_reset_audit.sql` | Se puede ejecutar: sólo escribe tablas temporales de la conexión. Deténgase y haga revisar la evidencia. |
| Sólo después de backup restaurado y precheck aprobado | `02_tenant_reset.sql` | Ejecútelo primero sin editar: termina en `ROLLBACK` y es un ensayo. No cambia datos de forma permanente. |
| Sólo después de aprobar el ensayo | `02_tenant_reset.sql` | Cambie únicamente el último `ROLLBACK;` por `COMMIT;` y ejecute el archivo completo. Esta ejecución sí es destructiva. |
| Inmediatamente después del commit real | `03_post_reset_validation.sql` | Ejecútelo en la misma conexión de DBeaver para poder comparar las huellas temporales del precheck. |
| Antes de operar y si hay una incidencia | `04_reset_rollback_notes.sql` | Lea las instrucciones; no es un mecanismo de restauración automática. |

Aunque el precheck diga `PASS`, eso no autoriza por sí solo el borrado. También
deben existir una restauración de backup probada, evidencia revisada, una ventana
de mantenimiento sin escritores y una aprobación humana explícita. Un `FAIL`,
un error SQL o una tabla poblada clasificada como `UNKNOWN` detiene el proceso.

## Cómo entregar la evidencia del precheck

Mantenga abierta la conexión que ejecutó el precheck: cerrar/reconectar elimina
`pg_temp.reset_inventory` y `pg_temp.reset_global_fingerprints`. En DBeaver,
guarde por separado estas tres clases de evidencia:

1. **Result sets:** en cada pestaña/grilla de resultados use el menú contextual
   **Export data** (o el botón de exportación), elija CSV, active encabezados y
   exporte todos los registros. Use UTF-8, coma como separador y comillas para
   texto. No exporte sólo las filas visibles.
2. **Mensajes y errores:** copie o guarde el contenido completo de las pestañas
   **Output/Log** del editor, incluyendo timestamps, duración, warnings y el
   primer error. La grilla no contiene los `NOTICE` ni todos los errores.
3. **Contexto:** adjunte el SQL exacto/commit ejecutado, fecha UTC, base y servidor
   (pueden anonimizarse), `current_database()`, `current_user`, `version()` y el
   último resultado literal del precheck. Nunca comparta contraseña, URL con
   credenciales, cookies, tokens ni dumps con datos personales innecesarios.

Los result sets mínimos que deben compartirse son: matriz completa de tablas,
las tres consultas del usuario diagnóstico, huellas globales y el resultado
final `RESET PRECHECK`. Comprímalos en ZIP si son grandes, conservando nombres
claros como `01_table_matrix.csv`, `02_diagnostic_user.csv`,
   `03_memberships.csv`, `04_clubs.csv`, `05_global_fingerprints.csv`,
   `06_precheck_checks.csv`, `07_precheck_status.csv` y `08_output_log.txt`.

Si las pestañas anteriores ya se cerraron pero la conexión sigue viva, puede
recuperar el inventario y las huellas con:

```sql
SELECT * FROM pg_temp.reset_inventory ORDER BY table_schema, table_name;
SELECT * FROM pg_temp.reset_global_fingerprints ORDER BY table_schema, table_name;
SELECT current_database(), current_user, version(), now() AT TIME ZONE 'UTC' AS captured_at_utc;
```

Esto no reconstruye la matriz rica (columnas/FKs/estrategia) ni las consultas
diagnósticas. Para recuperarlas, vuelva a ejecutar **solamente**
`01_pre_reset_audit.sql` y exporte todas sus grillas; no ejecute aún `02`.

### Si el chat de Codex sólo permite adjuntar imágenes

No convierta una matriz grande en capturas: se cortan filas y columnas y pueden
ocultar el dato que bloquea el reset. Codex puede leer archivos que estén dentro
del workspace aunque el selector del chat no acepte CSV/TXT. Este repositorio
ignora deliberadamente `.local-evidence/` para que la evidencia operativa y los
datos personales no terminen en un commit.

1. Cree, dentro de la copia local de este repositorio,
   `.local-evidence/tenant-reset/`.
2. Desde DBeaver exporte allí los CSV y el TXT con los nombres indicados arriba.
3. Compruebe que no contienen contraseñas, tokens, URLs con credenciales ni hashes
   de contraseña; redacte esos valores sin eliminar encabezados, UUIDs de relación
   o conteos necesarios para el diagnóstico.
4. Envíe un mensaje de texto a Codex: `Lee .local-evidence/tenant-reset/, analiza
   el precheck y no ejecutes ningún SQL destructivo`.
5. Codex debe listar primero los archivos que pudo abrir y confirmar que
   `git status --short` no los incluye antes de emitir una recomendación.

Si DBeaver está en otra computadora o el workspace de Codex es remoto, esa ruta
no será compartida automáticamente. En ese caso abra cada CSV con un editor y
pegue su contenido como texto en varios mensajes, comenzando por
`06_precheck_status.csv`, las filas `UNKNOWN`/con conteo positivo de la matriz,
memberships, clubes, huellas y finalmente el log. Etiquete cada bloque con el
nombre del archivo y use un bloque de código; el campo normal del mensaje admite
texto aunque el selector de adjuntos sólo ofrezca imágenes. Como último recurso,
use capturas con encabezados visibles, filas completas y numeración, pero no se
autorizará el reset si la evidencia queda truncada o ilegible.

### Error de DBeaver: `dataSource is null`

El mensaje `Cannot invoke ... DBPDataSource.getContainer() because "dataSource"
is null` proviene de la capa de exportación de DBeaver, no de PostgreSQL ni del
resultado del precheck. No ejecute `02` para intentar resolverlo. Cambiar CSV por
XLSX, JSON o XML normalmente no ayuda porque esos formatos pasan por el mismo
asistente **Data Transfer**.

Proceda de menor a mayor impacto:

1. Mantenga abierta la conexión original. En una grilla pequeña use
   **Seleccionar todo** y **Copy advanced → CSV** (los nombres pueden variar por
   versión), pegue en un archivo UTF-8 y verifique encabezados y número de filas.
   Para el estado final, memberships, clubes y huellas ésta es la alternativa
   preferida al asistente que falló.
2. Si la grilla está desconectada o el editor perdió su datasource, abra un editor
   SQL nuevo desde la conexión PostgreSQL correcta, confirme que aparece como
   conectado, y vuelva a ejecutar **solamente** `01_pre_reset_audit.sql`. Exporte
   desde las grillas nuevas. Esto recreará las tablas temporales en la nueva
   sesión; no mezcle huellas de conexiones diferentes.
3. Si **Copy advanced** también falla, copie como texto tabulado, guárdelo como
   `.tsv` o `.txt` y compártalo: para el análisis importa conservar encabezados,
   todas las filas y valores completos, no que la extensión sea `.csv`.
4. Como alternativa independiente de DBeaver, use `psql` con `\copy` para
   consultas que no dependan de `pg_temp`. `\copy` escribe en el equipo cliente;
   no use `COPY ... TO '/ruta'`, que escribe en el servidor y requiere privilegios.
   Las tablas temporales sólo existen en la sesión que las creó, por lo que no
   serán visibles desde un `psql` abierto por separado: en ese caso ejecute allí
   el precheck y las exportaciones dentro de esa misma sesión.

Antes de actualizar o reiniciar DBeaver, guarde el SQL y copie las grillas pequeñas
al portapapeles: reiniciar elimina la sesión y sus huellas temporales. Si decide
actualizar DBeaver, anote primero **Help → About**, pruebe la versión estable más
reciente y vuelva a ejecutar únicamente el precheck. Una exportación que termina
sin excepción todavía debe comprobarse abriendo el archivo y comparando su número
de filas con la grilla.
