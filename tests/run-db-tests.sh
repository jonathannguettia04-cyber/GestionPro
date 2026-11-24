#!/usr/bin/env bash
# Usage : DATABASE_URL=postgres://... npm run test:db   (base de TEST jetable uniquement)
set -euo pipefail
: "${DATABASE_URL:?Définir DATABASE_URL vers une base de test jetable}"
cd "$(dirname "$0")/.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f tests/sql/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -t -f tests/sql/10_rls_isolation.sql
