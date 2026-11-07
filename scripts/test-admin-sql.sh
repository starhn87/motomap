#!/bin/bash
# 운영 연결 없이 임시 로컬 PostgreSQL에서 관리자 권한·감사·경합만 검사한다.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
if [ -n "${MOTOMAP_PG_BIN:-}" ]; then
  pg_bin=$MOTOMAP_PG_BIN
elif command -v initdb >/dev/null 2>&1; then
  pg_bin=$(dirname "$(command -v initdb)")
else
  pg_bin=$(dirname "$(ls -d /usr/lib/postgresql/*/bin/initdb | head -1)")
fi
work=$(mktemp -d /tmp/motomap-admin-sql.XXXXXX)
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/server.log" -o "-k $work -p 54397 -c listen_addresses=''" start >/dev/null
psql=("$pg_bin/psql" -X -v ON_ERROR_STOP=1 -h "$work" -p 54397 -d postgres)
"${psql[@]}" -f "$root/tests/sql/admin-setup.sql" >/dev/null
actor=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
place=33333333-3333-4333-8333-333333333333
sql="set role service_role; select public.apply_admin_place_decision('$place', 'approve', '$actor');"
"${psql[@]}" -c "$sql" >/dev/null &
first=$!
"${psql[@]}" -c "$sql" >/dev/null &
second=$!
wait "$first"
wait "$second"
"${psql[@]}" -f "$root/tests/sql/admin-assert.sql" >/dev/null
echo ADMIN_SQL_PASS
