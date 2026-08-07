# Checklist posterior (Etapa C, sólo tras PASS de `14`)

- [ ] Backup y export de `01` archivados; scripts/commit identificados.
- [ ] Todos los checks de `14` en PASS.
- [ ] Fingerprint, cantidad, totales por tipo y mes PRE = POST exactamente.
- [ ] Inscripciones, cuotas y deuda PRE = POST exactamente.
- [ ] Login Fernando; TenantContext miClub; autorización DIRECTOR.
- [ ] Inicio carga y conserva cifras.
- [ ] Economía carga capital, ingresos, egresos, liquidez y proyección correctos.
- [ ] CRM lista miembros/deudores y prepara mensajes sin enviar.
- [ ] Administración carga summary, sectores, actividades, empleados, tareas,
  solicitudes, movimientos e inscripciones.
- [ ] Migración: health, batches y dry-run; **no ejecutar import real**.
- [ ] Ejecutar `npm run typecheck`, `npm run build` y `npm test -ws --if-present`.
- [ ] Probar endpoints autenticados y revisar audit log.
- [ ] Resolver manualmente actividades sin responsable/configuración.
