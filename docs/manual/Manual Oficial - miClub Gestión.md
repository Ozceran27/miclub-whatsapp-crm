PORTADA

Manual Oficial de Usuario — miClub Gestión

Sistema Integral de Gestión Operativa

Versión del documento: 1.0 — Capítulo 1 Inicio

Fecha de generación: 30/06/2026

Estado: Versión Estable

Logo: apps/web/public/logo/miClub - Logo trans.png



ÍNDICE

Capítulo 0 Presentación

Capítulo 1 Inicio

Capítulo 2 Economía Club

Capítulo 3 Espacio Fitness

Capítulo 4 Salón

Capítulo 5 Aula

Capítulo 6 Local 1

Capítulo 7 Cantina

Capítulo 8 CRM

Capítulo 9 Migración

Capítulo 10 Administración

Capítulo 11 Arquitectura Técnica

Apéndices



CAPÍTULO 1 — INICIO



Alcance auditado. La pantalla Inicio está implementada por HomeModule, useHomeDashboard, HomeMetricCards, RecentMovements y SectorDistribution. Consume endpoints raíz legacy compatibles: /summary, /members, /debtors, /sync-status, /club-finance-summary y /sector-operational-summary. En el estado productivo declarado, PostgreSQL es la fuente oficial; Google Sheets queda como origen histórico de migración y compatibilidad no productiva.



1. Panel Operativo

Qué representa: cabecera ejecutiva del Inicio con título “Panel operativo de miClub”, estado de sincronización, fecha de última sincronización y botón Sincronizar.

Estado: el frontend muestra “Con advertencias” si /sync-status devuelve error; muestra “Google Sheets conectado” si la fuente fuese google_sheets; para cualquier otro caso muestra “Datos mock/locales”. Inconsistencia: para source=postgres no existe etiqueta específica y el frontend cae en “Datos mock/locales”, aunque el backend productivo responde source=postgres. Impacto: puede confundir al usuario sobre el origen oficial. Solución: agregar etiqueta “PostgreSQL conectado”.

Última sincronización: se formatea en es-AR desde lastSyncAt. En PostgreSQL, /sync-status ejecuta health check; si es correcto actualiza lastSyncAt con la fecha/hora actual.

Botón Sincronizar: vuelve a ejecutar loadHome y recarga en paralelo todos los endpoints del Inicio. No importa datos ni escribe en PostgreSQL; solo refresca la vista.

Origen de datos: DATA_SOURCE=postgres activa PostgreSQL mediante shouldUsePostgresDataSource. Google Sheets no es backend oficial; aparece solo en rutas heredadas y procesos de migración.

Tablas/servicios: /sync-status usa getPostgresHealth y validatePostgresEnv. Los datos funcionales se construyen desde people, enrollments, activities, sectors, movements, operational_balances y sheet_metric_snapshots.



2. Resumen Financiero

Endpoint: GET /club-finance-summary. Servicio: getPostgresClubFinanceSummary. Consultas principales: miclub.v_dashboard_basic, miclub.operational_balances, miclub.v_sector_settlement_balances y miclub.v_movements_enriched.

Liquidez: valor destacado. En la vista SQL se calcula como capital sin dólares + saldos positivos a liquidar + dólares valorizados por tipo de cambio del último operational_balances. En el servicio se toma de operational_balances más reciente o de v_dashboard_basic. Interpretación: capacidad económica operativa actual del club.

Caja: suma neta de movimientos administrativos completados con payment_method efectivo: ingresos/capital suman, egresos restan.

Banco: suma neta de movimientos administrativos completados con payment_method transferencia: ingresos/capital suman, egresos restan.

Dólares: suma neta de movimientos administrativos completados cuya categoría normalizada es DOLARES: ingresos/capital suman y egresos restan. Se presenta como USD entero redondeado.

Movimientos incluidos: movimientos de Administración completados para saldos reales; capital, ingresos y egresos según tipo; método de pago efectivo/transferencia; categoría Dólares para USD.

Movimientos excluidos: pendientes, cancelados/no completados para caja/banco/dólares; movimientos fuera de Administración para saldos administrativos; importes sin estado o categoría que no cumplen las reglas.

Ajustes manuales: operational_balances se ordena por cutoff_date y created_at descendente; el registro más reciente prevalece como foto operativa, incluyendo source_payload con tipo de cambio histórico.



3. Saldos Operativos

Endpoint: GET /club-finance-summary. Servicio: getPostgresClubFinanceSummary. Contrato compartido: ClubOperationsSummary.

Cuotas a Cobrar: suma de receivable_fee de inscripciones cuyo estado efectivo es adeudando. La cuota se normaliza si llegó inflada por mil: valores enteros >= 1.000.000 divisibles por 1.000 se dividen por 1.000. Se excluyen cuotas <= 0, abandonados y cancelados. Comisión aplicada: Fitness 50%; Salón 0%; Aula usa club_commission_percent acotado entre 0 y 1; otros sectores 0.

Saldos Pendientes: pendingNetBalance = pendingIncome - pendingExpenses. El SQL de la vista suma además futureReceivableFeesUntilMonthEnd, pero el servicio usa un fallback directo sobre v_movements_enriched filtrando source_payload.sheet = ADMINISTRACIÓN y estado operativo PENDIENTE o estado financiero pendiente; por eso el valor de la pantalla es neto de ingresos pendientes menos egresos pendientes administrativos.

Saldos a Liquidar: suma de saldos positivos a liquidar por sector. El servicio toma v_sector_settlement_balances con settlement_balance > 0 y complementa snapshots históricos fitness/salon/aula/local1. Se muestra con signo negativo porque representa obligación.

Saldo Proyectado: fórmula crítica del backend: Liquidez + Cuotas a cobrar + Saldos pendientes - Saldos a pagar. Cambia al modificar movimientos pendientes, pagos/estados de inscripciones, saldos de liquidación o liquidez.

Registros que afectan: enrollments.fee_amount/status/due_date/activity_id; activities.club_commission_percent/sector_id; sectors.code/name; movements.amount/type/status/financial_status/source_payload; operational_balances; sheet_metric_snapshots.



4. Ingresos por Sector

Endpoint /club-finance-summary. SQL: v_movements_enriched filtrada por movement_type=INGRESOS y operational_status=COMPLETADO, agrupada por sector_name con “Sin datos” como fallback. Se ordena por monto descendente y nombre ascendente, limitado a 4 filas. La pantalla marca con estrella el sector principal. No cuenta egresos, pendientes ni movimientos no completados.



5. Egresos por Sector

Mismo endpoint y servicio. Filtra movement_type=EGRESOS y operational_status=COMPLETADO, agrupa por sector_name, ordena por monto descendente y limita a 4. El primer egreso se marca con señal visual negativa. No incluye ingresos ni pendientes.



6. Inscriptos

Endpoints: /summary, /members y /debtors. Servicios: getPostgresSummary, getPostgresMembers, getPostgresDebtors.

Total: cantidad de filas actuales de v_current_enrollments mapeadas como miembros.

Activos: inscripciones cuyo estado normalizado no es abandonado ni cancelado.

Al día: estado normalizado al_dia. Nuevo inscripto con due_date vigente puede convertirse en “Al día” durante el mapeo.

Adeudando: estado normalizado adeudando. Nuevo inscripto vencido puede convertirse en “Adeudando”.

Abandonados: estado abandonado.

Cancelados: estado cancelado.

Cuota promedio: promedio simple de cuotas positivas de miembros activos cargados en frontend.

Adeudados por actividad: se filtran miembros deudores, se agrupan por actividad o modalidad, se ordenan por cantidad descendente y nombre; se muestran las primeras 3 y un contador de actividades restantes.



7. Inscriptos por actividad

Se calcula en frontend con miembros activos: excluye abandonados y cancelados, agrupa por actividad/modalidad, ordena por cantidad descendente y nombre, muestra las primeras 6 y destaca la primera. No usa un endpoint específico adicional: depende de /members.



8. Distribución Operativa por Sector

Endpoint: /sector-operational-summary. Servicio: getPostgresSectorOperationalSummary.

Espacio Fitness: total de inscriptos, activos, adeudados, monto adeudado, rentabilidad total, rentabilidad mensual y saldo a liquidar. Rentabilidad y saldo provienen de sheet_metric_snapshots; si faltan, se marca pendiente de cálculo. Adeudados suman cuotas de miembros Fitness con estado adeudando.

Local 1: rentabilidad total, rentabilidad mensual, saldo a liquidar, total ventas, ventas últimos 30 días e ingreso destacado. Ventas relevantes son ingresos completados del sector Local 1 con categoría comisión o ventas. Ingreso destacado es el mayor monto y, ante empate operativo, el más reciente.

Salón: total, activos, rentabilidad total/mensual, actividad más popular y menos popular. Popularidad usa inscripciones no abandonadas/no canceladas agrupadas por actividad, ordenadas por cantidad.

Aula: total, activos, rentabilidad total/mensual, comisión promedio y actividad más popular. Comisión promedio proviene de snapshot aula.average_commission.

Cantina: kiosco, bebidas, CMV y rentabilidad total. Fórmula: ingresos kiosco + ingresos bebidas - egresos bebidas. Puede usar snapshots y fallback consultado.

CRM: total de miembros, activos, deudores y monto adeudado general. Es una tarjeta de visión transversal de cobranzas.



Interpretación Operativa

Primero mirar Liquidez y Saldo proyectado: si ambos bajan, existe riesgo financiero. Luego revisar Saldos a Liquidar para entender obligaciones próximas. Después analizar Cuotas a cobrar y Adeudados por actividad para detectar morosidad concentrada. Ingresos y egresos por sector muestran dónde se genera o consume dinero. Las tarjetas sectoriales permiten identificar qué unidad crece, cuál pierde rentabilidad y dónde conviene accionar. Un crecimiento sano combina más activos, ingresos completados y rentabilidad mensual positiva. Una alerta de morosidad aparece cuando aumentan Adeudando, Monto adeudado o Cuotas a cobrar sin mejora en liquidez. Una caída de ingresos se ve cuando el ranking de ingresos baja o cuando rentabilidad mensual queda pendiente, negativa o menor al patrón esperado.



Buenas prácticas

Actualizar Inicio antes de tomar decisiones. Leer saldos proyectados como estimación operativa, no como extracto bancario. Validar pagos pendientes antes de liquidar sectores. Revisar actividades con deudores altos. Usar tarjetas sectoriales para priorizar seguimiento.



Errores comunes

Confundir Saldos a Liquidar con dinero disponible. Leer Cuotas a cobrar como efectivo confirmado. Comparar Dólares con pesos sin tipo de cambio. Tratar Google Sheets como backend actual. Ignorar métricas “pendiente de cálculo”.



Recomendaciones

Agregar etiqueta PostgreSQL conectado. Revisar diferencias entre v_dashboard_basic y fallback del servicio en Saldos Pendientes. Consolidar snapshots críticos o reemplazarlos por vistas PostgreSQL autoritativas. Mantener pruebas sobre saldo proyectado, receivables y estados.



Inconsistencias detectadas

1. Etiqueta de origen en frontend: source=postgres se muestra como Datos mock/locales. Impacto alto de UX; solución: mapear postgres a PostgreSQL conectado.

2. Saldos Pendientes: v_dashboard_basic incluye cuotas futuras del mes en pending_net_balance, pero getPostgresClubFinanceSummary prioriza fallback directo sin cuotas futuras. Impacto: posible diferencia entre endpoint /api/dashboard/basic y pantalla Inicio. Solución: unificar fórmula.

3. Métricas sectoriales: varias rentabilidades y saldos dependen de sheet_metric_snapshots importados históricamente. Impacto: cobertura parcial si falta snapshot. Solución: vistas PostgreSQL completas por sector.

4. Rutas legacy raíz: el frontend consume /summary, /members, /debtors y no rutas /api. Impacto: contrato heredado; solución: documentar y migrar con compatibilidad.

