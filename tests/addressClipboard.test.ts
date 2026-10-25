import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

test('구 설치본은 클립보드 모듈이 없어도 안전하게 로드된다', async () => {
  const mod = loadModule<any>('lib/addressClipboard.ts', { 'expo-modules-core': { requireOptionalNativeModule: () => null } });
  assert.equal(mod.canCopyAddress, false); assert.equal(await mod.copyAddress('주소'), false);
});
test('복사는 사용자 요청 때만 지정한 주소를 쓰고 기존 클립보드를 읽지 않는다', async () => {
  const writes: any[] = [];
  const native = { setStringAsync: async (...args: any[]) => { writes.push(args); return true; }, getStringAsync() { throw Error('must not read clipboard'); } };
  const mod = loadModule<any>('lib/addressClipboard.ts', { 'expo-modules-core': { requireOptionalNativeModule: () => native } });
  assert.equal(mod.canCopyAddress, true); assert.equal(writes.length, 0);
  assert.equal(await mod.copyAddress('서울 테스트로 1'), true);
  assert.equal(writes[0][0], '서울 테스트로 1'); assert.equal(writes[0][1].inputFormat, 'plainText');
  assert.equal(await mod.copyAddress(' '), false); assert.equal(writes.length, 1);
});
