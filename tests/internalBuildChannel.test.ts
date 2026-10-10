import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';

const configUrl = new URL('../app.config.js', import.meta.url);
const source = readFileSync(configUrl, 'utf8').replace('export default', 'module.exports =');

function readUpdates(profile?: string) {
  const config = new Script(source).runInNewContext({
    require: createRequire(configUrl),
    module: { exports: {} },
    process: { env: { EAS_BUILD_PROFILE: profile } },
  }) as { expo: { updates: { requestHeaders?: Record<string, string>; url: string } } };
  return config.expo.updates;
}

test('명시한 내부 프로필만 네이티브 업데이트 채널 헤더를 생성한다', () => {
  assert.equal(readUpdates('internal-testflight').requestHeaders?.['expo-channel-name'], 'internal-testflight');
  for (const profile of [undefined, 'production', 'development', 'preview', 'unknown']) {
    assert.equal(readUpdates(profile).requestHeaders, undefined);
  }
});

test('내부 프로필도 기존 업데이트 프로젝트를 유지한다', () => {
  assert.equal(readUpdates('internal-testflight').url, readUpdates('production').url);
});
