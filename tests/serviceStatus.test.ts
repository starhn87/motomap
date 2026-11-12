import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchServiceStatus,
  isVersionAtLeast,
  parseServiceStatus,
  resolveServiceGate,
  type ServiceStatus,
} from '../lib/serviceStatus';

const suspended: ServiceStatus = {
  schemaVersion: 1,
  status: 'suspended',
  minimumAppVersion: '1.2.8',
  storeUrl: 'https://apps.apple.com/kr/app/id6773636183',
  message: '운영을 준비하고 있어요.',
};

test('상태 응답의 명시된 계약만 허용한다', () => {
  assert.deepEqual(parseServiceStatus(suspended), suspended);
  assert.equal(parseServiceStatus({ ...suspended, schemaVersion: 2 }), null);
  assert.equal(parseServiceStatus({ ...suspended, status: 'unknown' }), null);
  assert.equal(parseServiceStatus({ ...suspended, minimumAppVersion: '1.2' }), null);
  assert.equal(parseServiceStatus({ ...suspended, storeUrl: 'http://apps.apple.com/app' }), null);
  assert.equal(parseServiceStatus({ ...suspended, storeUrl: 'https://example.com/app' }), null);
  assert.equal(parseServiceStatus(null), null);
});

test('버전을 모르면 서비스를 열지 않는다', () => {
  assert.equal(isVersionAtLeast(null, '1.2.8'), false);
  assert.equal(isVersionAtLeast('1.2.7', '1.2.8'), false);
  assert.equal(isVersionAtLeast('1.2.8', '1.2.8'), true);
  assert.equal(isVersionAtLeast('1.3.0', '1.2.8'), true);
  assert.equal(isVersionAtLeast('invalid', '1.2.8'), false);
});

test('운영 상태와 무관하게 최소 버전을 만족하면 앱을 시작한다', () => {
  assert.equal(resolveServiceGate(null, '1.2.8'), 'check-update');
  for (const status of ['suspended', 'preparing', 'active'] as const) {
    assert.equal(resolveServiceGate({ ...suspended, status }, '1.2.8'), 'check-update');
    assert.equal(resolveServiceGate({ ...suspended, status }, '1.2.7'), 'update');
  }
  assert.equal(resolveServiceGate(null, '1.2.3'), 'update');
  assert.equal(resolveServiceGate(null, null), 'update');
  assert.equal(resolveServiceGate({ ...suspended, minimumAppVersion: '1.0.0' }, '1.2.3'), 'update');
});

test('네트워크 오류와 503 응답에도 지원 버전은 시작할 수 있다', async () => {
  const unavailable = await fetchServiceStatus(async () => {
    throw new Error('offline');
  });
  const maintenance = await fetchServiceStatus(async () => new Response('maintenance', { status: 503 }));
  assert.equal(unavailable, null);
  assert.equal(maintenance, null);
  assert.equal(resolveServiceGate(unavailable, '1.2.8'), 'check-update');
  assert.equal(resolveServiceGate(maintenance, '1.2.8'), 'check-update');
});
