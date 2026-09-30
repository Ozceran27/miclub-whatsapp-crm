# Catálogo de cálculos de Tesorería

## Fuentes y reglas comunes

PostgreSQL es la fuente operacional. El club proviene de la sesión y todas las consultas filtran por `club_id`; ninguna hoja histórica define el alcance. Los movimientos `COMPLETADO` de tipo técnico `INGRESOS` y `EGRESOS` alimentan los agregados ordinarios. `CAPITAL` queda fuera. Pendientes y feeds de actividad son excepciones explícitas. Las categorías usan `miclub.category_catalog.classification`, nunca su nombre visible. Los intervalos son semiabiertos `[desde, hasta)` y las fechas se interpretan en la zona horaria del club cuando se obtiene el período.

Cada movimiento se valora en `clubs.base_currency_code` al día local de `movement_date`. Se acepta la cotización oficial directa o inversa más reciente de hasta cuatro días, o dos tramos vía USD. Si falta cotización para cualquier movimiento de un agregado, su importe es `null`, `valuationStatus` es `INCOMPLETE_EXCHANGE_RATE` y `missingRateCount` indica cuántos faltan. El frontend muestra “Sin cotización”; no transforma `null` en cero. Los movimientos individuales del feed conservan su moneda e importe originales.

## Indicadores y contratos

| Indicador | Cálculo y fuente | Período / endpoint |
|---|---|---|
| Ingresos, Egresos, Utilidad | `Σ valued_amount` por tipo; utilidad = ingresos − egresos. Incluye categorías operativas y no operativas sin doble conteo. | Mes vigente; `/api/economy/summary`. Año seleccionado; `/monthly-evolution?year=` y `/annual-summary?year=`. |
| Liquidez, Saldo proyectado | `readFinancialCircuit.projection`. Liquidez procede de las cuentas y el corte de arranque aprobado. Proyección incorpora los componentes y supuestos vigentes del circuito. | Actual, independientemente del año histórico; `/api/economy/summary` y detalle `/api/finance/circuit`. Una cuota generada sin cobro no incrementa liquidez. |
| Pendientes | Ingresos pendientes − egresos pendientes de todos los orígenes del club. Ningún filtro por hoja “ADMINISTRACIÓN”. | Mes vigente en `/summary`; histórico en `/pending`. |
| Comparaciones | Variación de ingresos, egresos, utilidad, rentabilidad operativa y crecimiento entre los dos últimos meses completos. `calculateVariation` mantiene la convención de signo y la falta de base devuelve `null`. Egresos invierte sólo el impacto favorable. | `/api/economy/comparison`; tarjetas no cambian al seleccionar un año histórico. |
| Crecimiento | Promedio de variación de ingresos y variación de inscriptos acumulados al cierre. Un inscripto se relaciona con actividad y sector del mismo club; `end_date` y `superseded_at` determinan vigencia histórica. | `/comparison` y `/monthly-evolution?year=`. |
| Rentabilidad operativa | Ingresos operativos − egresos operativos; clasificación canónica `OPERATIONAL`. Se excluyen cobros del grupo de pagos `COLLECT` cuando corresponda. | `/comparison`, `/monthly-evolution?year=`, rankings. |
| Ranking sector / categoría | Ingresos y egresos operativos completados, balance = ingresos − egresos; orden descendente con `null` al final. Se muestran seis filas. | Mes actual: `/sector-rankings` y `/by-category`; ranking sectorial anual adicional en `/sector-rankings`. |
| Medios de pago | Ingresos completados valorados por medio; porcentaje sólo si la suma de todos los medios está completa. No operativo, pasivo, servicios e impuestos se separan por clasificación canónica y signo neto. | Mes actual y año a fecha; `/payment-methods`. |
| Desglose interanual | Ingresos operativos por categoría; gastos por clasificación, deuda/servicios/impuestos como egresos − ingresos. Si alguna serie contiene cotización faltante, el conjunto informa estado incompleto. | Ventana interanual de 13 meses hasta `asOf`; `/yearly-breakdown`. |
| Años disponibles | Años locales con cualquier movimiento del club más año corriente. | `/available-years`. |
| Feed reciente | Últimos movimientos de cualquier estado; muestra moneda original. | `/recent-movements`. |

Los contratos de agregados incluyen `currencyCode`, período o año cuando corresponde, `valuationStatus` y `missingRateCount`; un importe incompleto puede ser `null`. Cada sección de la web se consulta en una clave de caché que contiene club, recurso y filtros. Las mutaciones invalidan Tesorería y el cambio de sesión elimina caché del club anterior.

## Caracterización y verificación

La fórmula pura `calculateVariation` y el fixture aprobado `apps/api/src/services/fixtures/economy-characterization.approved.json` permanecen sin cambios. La corrección de SQL se compara con `apps/api/src/repositories/economyRepository.test.ts` y el flujo PostgreSQL aislado `apps/api/integration/financialCircuitRegression.test.ts`. Los datos reales requieren el script de solo lectura `docs/dbeaver/treasury_readonly_reconciliation.sql`; ningún resultado de la base local vacía certifica saldos de producción.

Para reemplazar otra fórmula o consulta: caracterizar una muestra con cero, negativo, estado no completado, moneda faltante, corte de fecha y segundo club; comparar la salida antes y después; cambiar un consumidor por vez; ejecutar pruebas de dominio, API, frontend y build. Mantener separadas las revisiones de fórmulas puras y SQL productivo.
