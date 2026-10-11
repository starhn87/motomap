import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const previous = readFileSync(new URL('../supabase/migrations/20260825105614_add_place_change_reports.sql', import.meta.url), 'utf8');
const legacy = readFileSync(new URL('../supabase/migrations/20261011031348_drop_unused_legacy_rides.sql', import.meta.url), 'utf8');
const cache = readFileSync(new URL('../supabase/migrations/20261011031406_restrict_maintenance_cache_cleanup.sql', import.meta.url), 'utf8');
const body = (sql: string) => sql.match(/function public\.prepare_account_deletion\(p_user_id uuid\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)![1];
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

test('과거 GPS 파기 준비는 기존 계정 정리 본문에서 rides 참조 한 줄만 제거한다', () => {
  const original = body(previous);
  assert.equal(createHash('md5').update(original).digest('hex'), '7f04a66af98dbb9dc07b96f2a82490e4');
  assert.equal(body(legacy), original.replace('  delete from public.rides where user_id = p_user_id;\n', ''));
  assert.match(legacy, /revoke all on function public\.prepare_account_deletion\(uuid\) from public, anon, authenticated/);
  assert.match(legacy, /grant execute on function public\.prepare_account_deletion\(uuid\) to service_role/);
});

test('GPS 파기는 잠금·0행·본문 변경 검증 후 대상 테이블만 CASCADE 없이 제거한다', () => {
  const sql = withoutComments(legacy);
  assert.match(sql, /lock table public\.rides in access exclusive mode/);
  assert.match(sql, /if exists \(select 1 from public\.rides\) then\s+raise exception/);
  assert.match(sql, /md5\(prosrc\) = '7f04a66af98dbb9dc07b96f2a82490e4'/);
  assert.deepEqual(sql.match(/drop table[^;]+;/gi), ['drop table public.rides;']);
  assert.equal(/\bcascade\b/i.test(sql), false);
  assert.ok(sql.indexOf('lock table') < sql.indexOf('create or replace function'));
  assert.ok(sql.indexOf('create or replace function') < sql.indexOf('drop table'));
  assert.match(sql, /set local lock_timeout = '3s'/);
  assert.match(sql, /to_regclass\('public\.rides'\) is not null/);
});

test('관리 캐시 정리는 service_role만 호출하도록 준비하고 실제 정리는 실행하지 않는다', () => {
  const sql = withoutComments(cache);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /delete from public\.google_place_hours where fetched_at < now\(\) - interval '30 days'/);
  assert.match(sql, /revoke all on function public\.purge_google_place_hours\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.purge_google_place_hours\(\) to service_role/);
  assert.equal(/(?:select|perform)\s+public\.purge_google_place_hours\(\)/i.test(sql), false);
  assert.match(sql, /md5\(prosrc\) = 'c463c1a90cc40d59755ea82a98168cf2'/);
});

test('두 정비 파일은 트랜잭션·유한 시간·사후 권한 검증을 포함한다', () => {
  for (const migration of [legacy, cache]) {
    const sql = withoutComments(migration).trim();
    assert.match(sql, /^begin;/);
    assert.match(sql, /commit;$/);
    assert.match(sql, /set local statement_timeout = '30s'/);
    assert.match(sql, /do \$verify\$/);
    assert.match(sql, /has_function_privilege\('anon'/);
    assert.match(sql, /has_function_privilege\('authenticated'/);
    assert.match(sql, /has_function_privilege\('service_role'/);
  }
});
