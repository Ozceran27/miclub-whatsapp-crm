# Catálogo de cálculos económicos

## Objetivo y regla de consolidación

Este documento es el inventario normativo de las métricas expuestas por el módulo Economía. La implementación indicada como **autoritativa** es la única que puede decidir semántica económica. Los componentes web sólo pueden seleccionar valores ya calculados, formatearlos y calcular geometría o porcentajes estrictamente visuales. Una migración de una implementación duplicada debe hacerse en un PR posterior, una métrica por vez, comparando exactamente contra los resultados aprobados antes de borrar el código anterior.

Este catálogo no cambia fórmulas ni SQL productivo. En particular, un PR que cambie una fórmula de dominio no debe cambiar también las consultas productivas que la alimentan.

## Convenciones comunes

- **Tenant:** todas las consultas autoritativas reciben `clubId` y filtran por `m.club_id`, o consultan una vista tenant-scoped con `where club_id = $n`.
- **Importes:** ingresos y egresos se presentan como magnitudes positivas; balance/utilidad es `ingresos - egresos`. Las excepciones netas de deuda, servicios e impuestos se indican debajo.
- **Estado ordinario:** sólo `COMPLETADO` (y `COMPLETED` al evaluar fixtures en dominio). Pendientes, feed reciente y conteos de estado son excepciones explícitas.
- **Intervalos:** rangos temporales semiabiertos `[inicio, fin)`. El reloj de negocio es `America/Argentina/Buenos_Aires` (UTC−03:00, sin DST actualmente), salvo filas marcadas como “histórico”.
- **Categorías normalizadas:** mayúsculas, sin tildes, espacios colapsados y punto final removido. `CAPITAL` no integra ingresos/utilidad ordinarios.
- **Fixture aprobado:** `apps/api/src/services/fixtures/economy-characterization.approved.json`; la caracterización ejecutable está en `economyCharacterization.test.ts`. Los tests SQL caracterizan además parámetros, tenant y predicados sin cambiar SQL.

## Inventario de métricas públicas

| Métrica / campo | Fórmula autoritativa | Tabla o vista tenant-scoped | Estado | Signo | Categorías | Rango temporal / timezone | Endpoint | Implementación autoritativa | Test de caracterización |
|---|---|---|---|---|---|---|---|---|---|
| `summary.income` | `Σ amount` de ingresos | `miclub.movements` | completado | magnitud positiva almacenada | todas excepto `CAPITAL` | mes calendario actual `[día 1, día 1 siguiente)`, Buenos Aires | `GET /api/economy/summary` | repository `getMonthlySummary` | fixture `monthly_balance`; `economyRepository.test.ts` (monthly summary) |
| `summary.expenses` | `Σ amount` de egresos | `miclub.movements` | completado | magnitud positiva | todas excepto `CAPITAL` | mes actual, Buenos Aires | `GET /api/economy/summary` | repository `getMonthlySummary` | fixture `monthly_balance`; repository test |
| `summary.balance` / `month.balance` | `income - expenses` | `miclub.movements` | completado | positivo=favorable; negativo=déficit | todas excepto `CAPITAL` | mes actual, Buenos Aires | `GET /api/economy/summary` | SQL de `getMonthlySummary` (el service sólo adapta nombres) | fixture `monthly_balance` |
| `summary.liquidity` | saldo líquido consolidado de la vista | `miclub.v_dashboard_basic` | semántica de la vista | firmado | definida por la vista | actual/histórico, timezone de la vista | `GET /api/economy/summary` | vista + `getClubFinanceSummary` | `economyRepository.test.ts` (dashboard tenant filter) |
| `summary.projectedBalance` | saldo proyectado consolidado de la vista | `miclub.v_dashboard_basic` | semántica de la vista | firmado | definida por la vista | actual/histórico | `GET /api/economy/summary` | vista + `getClubFinanceSummary` | repository test |
| `summary.pendingBalance` | `pendingIncome - pendingExpenses`, sólo hoja Administración | `miclub.movements` | pendiente | firmado | todas | mes actual para summary; histórico para `/pending` | `GET /api/economy/summary`, `GET /api/economy/pending` | `getMonthlySummary` / `getPendingSummary` | `movementPredicates.test.ts`; repository tenant tests |
| `monthlyEvolution.income` | `Σ amount` ingresos | `miclub.movements` | completado | positivo | excepto `CAPITAL` | cada mes del año solicitado, Buenos Aires | `GET /api/economy/monthly-evolution?year=` | `getAnnualEvolution` | `economyRepository.test.ts` |
| `monthlyEvolution.expenses` | `Σ amount` egresos | `miclub.movements` | completado | positivo | excepto `CAPITAL` | cada mes del año | mismo | `getAnnualEvolution` | repository test |
| `monthlyEvolution.balance` / `utility` | `income - expenses` | `miclub.movements` | completado | firmado | excepto `CAPITAL` | cada mes del año | mismo | `getAnnualEvolution`; alias en service | fixture `monthly_balance` |
| `monthlyEvolution.operatingProfitability` | ingresos operativos `-` egresos operativos | `miclub.movements` + `movement_categories` | completado | firmado | inscripción, cuota, turnos, comisión, alquiler, eventos, ventas, clases, cursos, kiosco, bebidas | cada mes del año | mismo | categorías/clasificación en `economyDomain.ts`; agregación en `getAnnualEvolution` | fixture `operating_profitability`; `economyDomain.test.ts` |
| `monthlyEvolution.economicGrowth` | `(actual - anterior) / abs(anterior) × 100`; sin base ⇒ `null` | filas de evolución | completado | porcentaje firmado | ingresos excepto `CAPITAL` | mes contra mes anterior | mismo | función pura `calculateVariation` | fixture `variation`; domain test |
| `monthlyEvolution.clientGrowth` | misma variación sobre inscriptos acumulados activos | `enrollments` + `activities` + `sectors` | activo, no superseded | porcentaje firmado | sectores Fitness, Salón, Aula | acumulado al fin de cada mes, Buenos Aires | mismo | `getAnnualEvolution` + `calculateVariation` | domain growth test; repository test |
| `monthlyEvolution.growth` | promedio de `economicGrowth` y `clientGrowth`; `null` si alguna no es comparable | fuentes anteriores | estados anteriores | porcentaje firmado | anteriores | mes contra mes anterior | mismo | `economyService.getMonthlyEvolution` | domain growth test |
| ranking `income` | `Σ abs(amount)` ingresos operativos | `movements` + sector/categoría | completado | positivo | operativas | mes actual | `GET /api/economy/by-sector`, `/by-category` | `rankingQuery` + `normalizeRankingItems` | domain ranking test; repository tenant test |
| ranking `expenses` | `Σ abs(amount)` egresos operativos | mismas | completado | positivo | operativas | mes actual | mismos | `rankingQuery` | mismos |
| ranking `balance` | `income - expenses` | mismas | completado | firmado; orden descendente | operativas | mes actual; además YTD en `/sector-rankings` | mismos y `GET /sector-rankings` | `rankingQuery` | domain ranking test |
| medio de pago `amount` | `Σ abs(amount)` de ingresos por medio | `movements` + `payment_methods` | completado | positivo | todas | mes actual / año a fecha | `GET /api/economy/payment-methods` | `getPaymentMethods` repository | repository tenant test |
| medio de pago `percentage` | `amount / Σ amount × 100`, cero si total cero | resultado anterior | completado | `[0,100]`, visualizable | todas | mismo período | mismo | backend `normalizePaymentItems` | `economyClubService.test.ts` / service tests |
| no operativo `amount` | ingresos de grupo `-` egresos de grupo | `movements` + `movement_categories` | completado | firmado | publicidad, salarios, mantenim., depósitos, extracciones, dólares, reparaciones, viáticos, ganancia, pérdida, CMV, seguros, limpieza, librería, otros | mes actual / YTD, Buenos Aires | `GET /api/economy/payment-methods` | `getEconomyAuxiliarySummary`; lista en dominio | fixture `category_balances`; domain test |
| deuda/pasivo `amount` | ingresos `-` egresos | mismas | completado | firmado | deuda, deudas | mes actual / YTD | mismo | repository + categorías de dominio | fixture `category_balances`; domain test |
| servicios / impuestos | ingresos `-` egresos | mismas | completado | firmado | luz, agua, internet / impuesto(s) | mes actual / YTD | mismo | repository + clasificador puro | fixture `category_balances`; domain test |
| `pending.*` | sumas por tipo y balance `income - expenses`; conteo | `miclub.movements`, feed desde `v_movements_enriched` | sólo pendiente | importes positivos; balance firmado | todas; resumen sólo Administración | histórico, sin corte | `GET /api/economy/pending` | `getPendingSummary`, `getPendingMovements` | predicate and repository tests |
| `annualSummary.*` | sumas por tipo; balance `income - expenses` | `miclub.movements` | completado | convención común | todas | año solicitado `[1 ene, 1 ene)`, Buenos Aires | `GET /api/economy/annual-summary?year=` | `getAnnualSummary` repository | repository test |
| comparación ingreso/egreso/utilidad | variación porcentual; egreso invierte sólo el impacto favorable | `miclub.movements` | completado | cambio firmado | excepto `CAPITAL` | dos últimos meses calendario completos, Buenos Aires | `GET /api/economy/comparison` | `getCompletedMonthMovementSummary` + `calculateVariation` | fixture `variation`; completed-month domain test |
| comparación rentabilidad operativa | variación de `(ingresos op. - egresos op.)` | mismas + categorías | completado | cambio firmado | operativas | dos últimos meses completos | mismo | repository aggregation + domain variation | fixtures `variation`, `operating_profitability` |
| comparación crecimiento | promedio de variación de ingresos y de inscriptos acumulados | movements/enrollments/activities/sectors | completado / activo | porcentaje firmado o `null` | ingreso sin Capital; sectores definidos | dos últimos meses completos | mismo | `getGrowthSummary` + service | domain growth test |
| desglose ingreso operativo | `Σ amount` por categoría y mes | movements + movement_categories | completado | positivo | sólo operativas; excluye Capital | ventana interanual inclusiva de 13 meses, Buenos Aires | `GET /api/economy/yearly-breakdown?asOf=` | `getYearlyBreakdownRows` + puro `buildYearlyBreakdown` | yearly-breakdown domain tests |
| desglose gastos operativos/no operativos | sólo egresos del grupo | mismas | completado | gasto positivo | clasificador exclusivo | misma ventana de 13 meses | mismo | puro `buildYearlyBreakdown` | yearly-breakdown domain tests |
| desglose deuda/servicios/impuestos | `egresos - ingresos` | mismas | completado | gasto neto positivo; reintegro puede ser negativo | clasificador exclusivo | misma ventana | mismo | puro `buildYearlyBreakdown` | yearly-breakdown domain tests |
| movimientos recientes | sin agregación | `miclub.v_movements_enriched` | todos (excepción diagnóstica) | importe original | todas | últimos N por fecha/creación/id | `GET /api/economy/recent-movements` | `getRecentMovements` repository | repository tenant test |
| conteos por estado | `count(*)` por estado normalizado | `miclub.movements` | todos (diagnóstico) | entero no negativo | todas | mes actual | incluido en `/payment-methods` | `getMovementStatusCounts` | movement predicate tests |
| insights | selección/priorización de métricas anteriores; no recalcula dinero | fuentes anteriores | heredado | heredado | heredado | heredado | `GET /api/economy/insights` | `economyService.getInsights` | service/domain tests |

## Cálculos de presentación permitidos en web

Se permiten `Intl.NumberFormat`, signos y colores, redondeo de etiquetas, porcentaje recibido del backend, sumas para dibujar totales visibles que estén rotuladas explícitamente como presentación y geometría de gráficos. No se permite reconstruir balance, utilidad, rentabilidad, crecimiento, deuda, liquidez, proyección ni aplicar filtros de estado/categoría en React. `EconomyMonthlySummaryPanel` conserva hoy una suma de series exclusivamente visual; no es fuente contractual y nunca debe enviarse de vuelta ni sustituir un total del endpoint.

## Procedimiento obligatorio para reemplazar duplicaciones

1. Agregar al fixture aprobado un caso representativo, cero, negativo, estado no completado, categoría excluida y borde de fecha/timezone.
2. Ejecutar la implementación antigua y guardar su salida exacta como `expected`; la revisión humana aprueba el cambio al fixture.
3. Introducir la implementación autoritativa detrás de una comparación exacta (`deepEqual`, incluidos `null`, centavos, orden y longitud).
4. Cambiar un solo consumidor. No modificar en el mismo PR la fórmula pura y el SQL productivo.
5. Ejecutar tests de dominio, repository tenant-scoped, contrato HTTP y build web.
6. Sólo después de igualdad exacta, eliminar la duplicación y actualizar la fila de este catálogo.
