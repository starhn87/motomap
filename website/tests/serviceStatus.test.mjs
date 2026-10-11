import assert from 'node:assert/strict';
import test from 'node:test';

import { serviceStatus } from '../src/serviceStatus.js';
import worker from '../src/index.js';

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
};

test('승인된 정상 진입은 active이며 판매·소개/공유 복구와 구분한다', () => {
  assert.deepEqual(serviceStatus, {
    schemaVersion: 1,
    status: 'active',
    minimumAppVersion: '1.2.8',
    storeUrl: 'https://apps.apple.com/kr/app/id6773636183',
    message: '모토맵 서비스를 이용할 수 있어요.',
  });
  assert.equal(Object.isFrozen(serviceStatus), true);
});

test('상태 조회만 200으로 제공하고 홈페이지는 계속 중단한다', async () => {
  const statusResponse = await worker.fetch(new Request('https://motomap.kr/service-status'), env);
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await statusResponse.json(), serviceStatus);

  const homeResponse = await worker.fetch(new Request('https://motomap.kr/'), env);
  assert.equal(homeResponse.status, 503);
  assert.equal(homeResponse.headers.get('Cache-Control'), 'no-store');
  for (const path of ['/place/test', '/course/test', '/riding/test']) {
    const response = await worker.fetch(new Request(`https://motomap.kr${path}`), env);
    assert.equal(response.status, 503);
  }
});

test('상태 조회는 쓰기 요청을 허용하지 않는다', async () => {
  const response = await worker.fetch(
    new Request('https://motomap.kr/service-status', { method: 'POST' }),
    env,
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
});
