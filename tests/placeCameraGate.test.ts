import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaceCameraGate } from '../lib/placeCameraGate';

const first = { latitude: 37.5, longitude: 127, zoom: 15 };
const next = { latitude: 37.51, longitude: 127, zoom: 15 };

test('마커를 연달아 탭하면 이전 카메라 정착 이벤트로 새 상세가 열리지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes: boolean[] = [];
  const gate = createPlaceCameraGate(pending => changes.push(pending));
  gate.begin(first, 260);
  t.mock.timers.tick(100);
  gate.begin(next, 260);
  gate.settled(first);
  t.mock.timers.tick(210); // 첫 요청 제한을 넘겨도 두 번째 요청은 대기한다.
  assert.deepEqual(changes, [true, true]);
  gate.settled({ ...next, latitude: next.latitude + 0.00001 });
  t.mock.timers.tick(500);
  assert.deepEqual(changes, [true, true, false]);
});

test('카메라 정착 이벤트 누락, 지도 개입, 화면 해제로 대기가 남지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes: boolean[] = [];
  const gate = createPlaceCameraGate(pending => changes.push(pending));
  gate.begin(first, 260);
  t.mock.timers.tick(308);
  gate.begin(next, 260);
  gate.finish();
  gate.begin(first, 260);
  gate.dispose();
  t.mock.timers.tick(500);
  assert.deepEqual(changes, [true, false, true, false, true]);
});
