import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import policy from '../config/release-policy.json';

test('릴리스 정합성은 통과하고 후보 표시가 있을 때만 OTA 검사를 차단한다', () => {
  const source = execFileSync('node',['scripts/check-release-compatibility.mjs'],{encoding:'utf8'});
  assert.ok(source.includes(`app ${policy.appVersion}, native ${policy.nativeBridgeVersion}, api ${policy.apiContractVersion}`));
  const ota=spawnSync('node',['scripts/check-release-compatibility.mjs','--ota'],{encoding:'utf8'});
  assert.equal(ota.status,policy.unreleasedCandidateVersion ? 1 : 0);
  if(policy.unreleasedCandidateVersion) assert.match(ota.stderr,/미출시 네이티브 후보에는 OTA를 발행하지 않습니다/);
});
