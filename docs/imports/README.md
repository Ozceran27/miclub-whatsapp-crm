# Importación XLSX

- [`xlsx-runbook.md`](xlsx-runbook.md): operación soportada, dry-run y apply.
- [`xlsx-contract-v1.md`](xlsx-contract-v1.md): estructura física y validaciones del libro.
- [`xlsx-reader-decision.md`](xlsx-reader-decision.md): decisión técnica del lector seguro.

PostgreSQL es la fuente de verdad. El XLSX es una entrada controlada y nunca
aporta autoridad tenant. Google Sheets no forma parte del runtime.
