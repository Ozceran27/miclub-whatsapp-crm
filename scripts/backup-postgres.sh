#!/usr/bin/env bash
set -euo pipefail

# Backups must live outside the checkout. DATABASE_URL/PG* are consumed by
# PostgreSQL's clients and are never echoed by this script.
: "${BACKUP_DIR:?Set BACKUP_DIR to an absolute directory outside the Git checkout}"
case "$BACKUP_DIR" in /*) ;; *) echo "BACKUP_DIR must be absolute" >&2; exit 2;; esac

repo_root="$(git rev-parse --show-toplevel)"
case "$BACKUP_DIR/" in "$repo_root"/*) echo "BACKUP_DIR must be outside $repo_root" >&2; exit 2;; esac

for command in pg_dump pg_restore sha256sum; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }
done

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/miclub-$stamp.dump"
toc="$BACKUP_DIR/miclub-$stamp.toc"

# No --schema filter: the archive must include public (the migration ledger),
# miclub, their definitions, and table data. Blobs are included explicitly.
connection=()
if [[ -n "${DATABASE_URL:-}" ]]; then connection+=("$DATABASE_URL"); fi
pg_dump --format=custom --blobs --no-owner --no-privileges --file="$dump" "${connection[@]}"
pg_restore --list "$dump" >"$toc"

require_toc() {
  local pattern="$1" description="$2"
  if ! grep -Eq "$pattern" "$toc"; then
    echo "Invalid backup: missing $description" >&2
    rm -f "$dump" "$toc"
    exit 1
  fi
}
require_toc ' SCHEMA - public ' 'public schema'
require_toc ' TABLE public miclub_schema_migrations ' 'migration ledger definition'
require_toc ' TABLE DATA public miclub_schema_migrations ' 'migration ledger data'
require_toc ' SCHEMA - miclub ' 'miclub schema'
require_toc ' TABLE DATA miclub ' 'miclub table data'

sha256sum "$dump" >"$dump.sha256"
echo "Backup created and TOC-verified: $dump"
echo "Restore it into an empty disposable database and run db:readiness-report before approval."
