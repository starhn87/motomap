import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fabricTopLevelEventName,
  NAVER_MAP_FABRIC_EVENTS,
  registerNaverMapFabricEvents,
} from '@/lib/naverMapFabricEvents';

test('Fabric 정규화 이름이 프로덕션 fatal 이벤트와 같다', () => {
  assert.equal(fabricTopLevelEventName('onFirstMapRender'), 'topFirstMapRender');
  assert.equal(fabricTopLevelEventName('onMapRendered'), 'topMapRendered');
  assert.equal(fabricTopLevelEventName('onMapLoaded'), 'topMapLoaded');
  assert.equal(NAVER_MAP_FABRIC_EVENTS.topFirstMapRender, 'onFirstMapRender');
  assert.equal(NAVER_MAP_FABRIC_EVENTS.topMapRendered, 'onMapRendered');
  assert.equal(NAVER_MAP_FABRIC_EVENTS.topMapLoaded, 'onMapLoaded');
});

test('없는 렌더 이벤트만 등록하고 기존 등록은 유지한다', () => {
  const registry: Record<string, { registrationName?: string } | undefined> = {
    topCameraChanged: { registrationName: 'onCameraChanged' },
    topMapRendered: { registrationName: 'onMapRendered' },
  };

  const added = registerNaverMapFabricEvents(registry);

  assert.deepEqual(added.sort(), ['topFirstMapRender', 'topMapLoaded']);
  assert.equal(registry.topCameraChanged?.registrationName, 'onCameraChanged');
  assert.equal(registry.topMapRendered?.registrationName, 'onMapRendered');
  assert.equal(registry.topFirstMapRender?.registrationName, 'onFirstMapRender');
  assert.equal(registry.topMapLoaded?.registrationName, 'onMapLoaded');
  assert.deepEqual(registerNaverMapFabricEvents(registry), []);
});
