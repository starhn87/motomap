#!/bin/bash
# 운영 연결 없이 별도 로컬 클러스터에서 공간·권한 계약만 검사한다.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
pg_bin=${MOTOMAP_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work=$(mktemp -d /tmp/motomap-poi-sql.XXXXXX)
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true;rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/server.log" -o "-k $work -p 54389 -c listen_addresses=''" start >/dev/null
for sql in "$root/tests/sql/guide-poi-fixture.sql" "$root/supabase/migrations/20261028120911_add_guide_poi_map_reads.sql" "$root/tests/sql/guide-poi-assertions.sql";do
 "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$work" -p 54389 -d postgres -f "$sql" >/dev/null
done
echo GUIDE_POI_SQL_PASS
