#!/bin/bash
# 운영 연결 없이 임시 DB에서 동의 호환·공용 캐시 권한·예약 상한을 검증한다.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
pg_bin=${MOTOMAP_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
work=$(mktemp -d /tmp/motomap-tmap-sql.XXXXXX)
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true;rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/server.log" -o "-k $work -p 54390 -c listen_addresses=''" start >/dev/null
for sql in "$root/tests/sql/tmap-poi-fixture.sql" "$root/supabase/migrations/20261011142734_add_location_privacy_controls.sql" "$root/supabase/migrations/20261011150411_add_location_history_setting.sql" "$root/supabase/migrations/20261029001626_add_tmap_guide_pois.sql" "$root/tests/sql/tmap-poi-assertions.sql";do
 "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$work" -p 54390 -d postgres -f "$sql" >/dev/null
done
echo TMAP_POI_SQL_PASS
