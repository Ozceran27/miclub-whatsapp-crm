/*
ROLLBACK Y RECUPERACIÓN (documentación ejecutable sólo por decisión humana)

1. Ensayo: 02 termina deliberadamente en ROLLBACK. Ejecútelo completo, revise cada
   NOTICE/resultado y confirme que la sesión vuelve a ver los conteos pre-reset.

2. Aplicación: cuando backup restaurado, precheck y ensayo estén aprobados, cambie
   manualmente UNA sola línea final de 02: ROLLBACK; -> COMMIT;. Ejecute el archivo
   completo desde BEGIN, nunca sólo una selección. Después ejecute 03 en la misma
   conexión.

3. Antes de COMMIT: cualquier duda se resuelve con ROLLBACK;. El advisory lock se
   libera automáticamente al finalizar la transacción.

4. Después de COMMIT: no existe rollback transaccional. Detenga escritores, archive
   logs/evidencia y restaure la base COMPLETA desde el backup cuya restauración fue
   verificada antes del reset. Repita checks de integridad, ledger, autenticación y
   aislamiento antes de reabrir tráfico.

5. PROHIBIDO reconstruir usuarios, memberships, personas, movimientos, pagos u otro
   estado mediante INSERT manual. Las relaciones, secuencias, auditoría y secretos no
   pueden recuperarse de forma fiable así; la única recuperación es el backup probado.
*/
SELECT 'ROLLBACK NOTES: READ AND ACKNOWLEDGE BEFORE RESET' AS operator_gate;
