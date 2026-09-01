# Inventario de interfaz transversal

| Área | Componentes existentes | Estilos principales | Primitivas compartidas adoptadas |
|---|---|---|---|
| Onboarding | `OnboardingDialog`, progreso, pasos, editores y saldos iniciales | `onboarding-*`, `draft-*`, `opening-balances-*` | `formatMoney` para importes explícitos |
| Planes | `CommercialPlanCards` dentro de `MigrationStep` | `migration-plan-*` y estados selected/focus | Botones y tarjetas mantienen la semántica de radio existente |
| Migración | `DataMigrationModule`, `useDataMigration` | `migration-*` | `UiCard`, `UiAlert`, `UiState`, `UiButton`, `UiTable` y diálogo accesible |
| Administración | listas, paneles, modales y tarjetas de cabecera | `administration-*`, `activity-*`, `task-*`, `request-*` | `MoneyPresentation` para saldo USD y conversión |
| Economía | tarjetas, estados, tablas, rankings y gráficos | `economy-*`, `finance-*` | Formateador monetario central disponible para migración gradual |

## Reglas

- Todo importe nuevo declara `presentationCurrencyCode`; el locale solo controla separadores.
- Un equivalente desconocido se muestra como **No disponible**, nunca como cero.
- La conversión separa nominal USD, equivalente, fecha, vigencia y fuente.
- Tablas anchas viven en una región enfocables y desplazable; resultados asíncronos usan `aria-live`.
- Diálogos reciben foco inicial, atrapan `Tab`, aceptan `Escape` cuando corresponde y restauran el foco.
