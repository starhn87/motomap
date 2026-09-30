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

test('접수·준비·구버전에서는 정상 앱을 마운트하지 않는다', () => {
  assert.equal(resolveServiceGate(null, '1.2.8'), 'suspended');
  assert.equal(resolveServiceGate(suspended, '1.2.8'), 'suspended');
  assert.equal(
    resolveServiceGate({ ...suspended, status: 'preparing' }, '1.2.8'),
    'preparing',
  );
  assert.equal(
    resolveServiceGate({ ...suspended, status: 'active' }, '1.2.7'),
    'update',
  );
  assert.equal(
    resolveServiceGate({ ...suspended, status: 'active' }, '1.2.8'),
    'check-update',
  );
});

test('준비 중에는 별도 내부 TestFlight 채널의 새 버전만 열린다', () => {
  const preparing = { ...suspended, status: 'preparing' as const };
  assert.equal(resolveServiceGate(preparing, '1.2.8', true), 'check-update');
  assert.equal(resolveServiceGate(preparing, '1.2.7', true), 'update');
  assert.equal(resolveServiceGate(suspended, '1.2.8', true), 'suspended');
});

test('네트워크 오류와 503 응답은 중단으로 닫는다', async () => {
  const unavailable = await fetchServiceStatus(async () => {
    throw new Error('offline');
  });
  const maintenance = await fetchServiceStatus(async () => new Response('maintenance', { status: 503 }));
  assert.equal(unavailable, null);
  assert.equal(maintenance, null);
});
