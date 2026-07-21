# Economía Club

## Descripción general

El panel **Economía Club** consolida la lectura financiera operativa del club desde PostgreSQL. Su objetivo es mostrar una foto clara de ingresos, egresos, balance, liquidez, proyección, evolución mensual, rankings, métodos de pago, pendientes y últimos movimientos sin agregar lógica financiera en la capa visual.

La pantalla se arma en `EconomyModule` con tarjetas de cabecera, insights, resumen mensual, gráficos, rankings, métodos de pago, pendientes y movimientos recientes. La UI consume endpoints `/api/economy/*` desde `useEconomyDashboard`, manteniendo los cálculos en API/repositorios.

## Variables principales

- **Ingresos**: suma de movimientos de tipo `INGRESOS` con estado operativo `COMPLETADO`, excluyendo `CAPITAL` cuando corresponde a métricas económicas comparables o crecimiento.
- **Egresos**: suma de movimientos de tipo `EGRESOS` con estado operativo `COMPLETADO`, excluyendo `CAPITAL` cuando corresponde a métricas económicas comparables.
- **Balance / Utilidad**: ingresos completados menos egresos completados.
- **Liquidez**: valor operativo proveniente del resumen financiero de Inicio/PostgreSQL.
- **Saldo proyectado**: liquidez más componentes operativos proyectados expuestos por el resumen financiero de Inicio.
- **Pendientes**: movimientos con `financial_status = pendiente` u `operational_status = PENDIENTE`; son una excepción intencional al filtro de completados.
- **Anulados / cancelados**: se cuentan por estado cuando la métrica tiene como objetivo auditar estados no completados.

## Criterio oficial de estado `Completado`

Todas las métricas financieras consolidadas usan exclusivamente movimientos con estado operativo completado (`COMPLETADO`, con normalización helper que también acepta `COMPLETED` en cálculos de dominio). Este criterio aplica a ingresos, egresos, balance, utilidad, rentabilidad operativa, gastos no operativos, deudas/pasivos, servicios, impuestos, crecimiento económico, rankings sectoriales, métodos de pago, gráficos financieros y resumen mensual económico.

Excepciones intencionales:

- pendientes;
- a cobrar;
- a pagar;
- anulados/cancelados;
- cantidad de pendientes;
- cantidad de anulados;
- movimientos sin cerrar o calidad de datos.

## Categorías oficiales por cálculo

Las categorías están centralizadas en `apps/api/src/services/economyDomain.ts` y deben modificarse ahí para evitar fuentes de verdad duplicadas.

### Rentabilidad Operativa

Categorías:

- `INSCRIPCIÓN`
- `CUOTA`
- `TURNOS`
- `COMISIÓN`
- `ALQUILER`
- `EVENTOS`
- `VENTAS`
- `CLASES`
- `CURSOS`
- `KIOSCO`
- `BEBIDAS`

Fórmula: **ingresos completados - egresos completados** dentro de categorías operativas.

### Gastos no Operativos

Categorías:

- `PUBLICIDAD`
- `SALARIOS`
- `MANTENIM.`
- `DEPÓSITOS`
- `EXTRACCIONES`
- `REPARACIONES`
- `VIÁTICOS`
- `GANANCIA`
- `PÉRDIDA`
- `CMV`
- `SEGUROS`
- `LIMPIEZA`
- `LIBRERÍA`
- `OTROS`

Fórmula: **ingresos completados - egresos completados** dentro de estas categorías.

### Deudas/Pasivos

Categorías:

- `DEUDA`
- `DEUDAS`

Fórmula: **ingresos completados - egresos completados** dentro de estas categorías.

### Servicios

Categorías:

- `LUZ`
- `AGUA`
- `INTERNET`

Fórmula: **ingresos completados - egresos completados** dentro de estas categorías.

### Impuestos

Categorías:

- `IMPUESTOS`

Fórmula: **ingresos completados - egresos completados** dentro de esta categoría.

## Métodos de pago

Los métodos de pago se calculan para ingresos completados del período mensual y anual. El porcentaje se deriva del total de ingresos completados por método dentro de la ventana consultada.

## Tooltips

Los textos de tooltips están centralizados en `economyMetricTooltips.ts`. El sistema base es `InfoTooltip`, que posiciona el contenido como portal fijo, calcula espacio disponible y evita que el texto quede cortado por contenedores internos.

En las tarjetas de cabecera, el ícono `?` se renderiza en la misma fila visual que el valor principal, alineado a la derecha mediante un slot absoluto. Esto mantiene el valor centrado sin que el tooltip lo empuje ni se superponga.

## Modo oscuro / modo claro

El modo oscuro es el default. `ThemeProvider` guarda la preferencia en `localStorage` y aplica `data-theme` en el documento. Los estilos del panel usan tokens CSS y reglas específicas para que tarjetas, tooltips, tablas, gráficos y botones sean legibles en ambos temas.

## Responsive

El panel usa grids y filas flexibles para adaptar tarjetas, gráficos, rankings, tripticos financieros, pendientes y últimos movimientos. No se deben introducir anchos fijos para ubicar tooltips o valores de tarjetas; preferir `position: absolute` dentro de contenedores relativos y límites de ancho fluidos.

## Notas de mantenimiento

- No duplicar categorías ni fórmulas en componentes React.
- Mantener cálculos financieros en `economyDomain`, `economyRepository` y `economyService`.
- Mantener la exclusión/uso de pendientes solo en métricas diseñadas para pendientes.
- Si se agregan tarjetas nuevas, usar tooltips desde `economyMetricTooltips.ts` y respetar el patrón valor centrado + slot derecho.
- Al modificar fórmulas, agregar o actualizar tests de dominio/API antes de tocar la presentación.
