import assert from 'node:assert/strict';
import test from 'node:test';

import { canFallbackToCourseStart, friendlyRouteError, kakaoNaviErrorCode, kakaoNaviProviderError, routeErrorCode, shouldReduceRouteVias } from '../lib/kakaoRouteErrors';

test('KNSDK 오류 문구가 바뀌어도 코드로 경로 실패를 구분한다', () => {
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE_20413', message: 'vendor text' }), 20413);
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE_20412' }), 20412);
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE' }), null);
});

test('인증 실패와 연결 실패가 섞인 C103을 설정 오류로 영구 차단하지 않는다', () => {
  assert.equal(kakaoNaviProviderError({ code: 'E_KNSDK_INIT_C101' }, 'initialize').kind, 'configuration');
  assert.equal(kakaoNaviProviderError({ code: 'E_KNSDK_ROUTE_G401' }, 'route').kind, 'configuration');
  assert.equal(kakaoNaviProviderError({ code: 'E_KNSDK_INIT_C103' }, 'initialize').kind, 'temporary');
  assert.equal(kakaoNaviProviderError({ code: 'E_KNSDK_ROUTE_G504' }, 'route').kind, 'timeout');
  assert.equal(kakaoNaviProviderError({ code: 'E_KNSDK_ROUTE_G503' }, 'route').kind, 'temporary');
});

test('진단용 KNSDK 코드는 허용된 브리지 형식만 추출하고 원문을 버린다', () => {
  const raw = { code: 'E_KNSDK_INIT_C101', message: 'secret-key-with-coordinates' };
  const safe = kakaoNaviProviderError(raw, 'initialize');
  assert.equal(safe.vendorCode, 'C101');
  assert.equal(JSON.stringify(safe).includes(raw.message), false);
  assert.equal(kakaoNaviErrorCode({ code: 'E_KNSDK_INIT_secret-key' }), undefined);
  assert.equal(kakaoNaviErrorCode({ code: 'E_KNSDK_INIT_C101_extra' }), undefined);
});

test('경유지 축소와 코스 출발지 폴백은 도로 단절 오류에만 적용한다', () => {
  const disconnectedVia = kakaoNaviProviderError({ code: 'E_KNSDK_ROUTE_20412' }, 'route');
  assert.equal(routeErrorCode(disconnectedVia), 20412);
  assert.equal(shouldReduceRouteVias(disconnectedVia), true);
  assert.equal(canFallbackToCourseStart(disconnectedVia), true);
  assert.equal(shouldReduceRouteVias({ code: 'E_KNSDK_ROUTE_20413' }), false);
  assert.equal(canFallbackToCourseStart({ code: 'E_KNSDK_ROUTE_20413' }), true);
  for (const code of ['G401', 'G503', 'C103', '20411', '20010']) {
    const failure = kakaoNaviProviderError({ code: `E_KNSDK_ROUTE_${code}` }, 'route');
    assert.equal(shouldReduceRouteVias(failure), false);
    assert.equal(canFallbackToCourseStart(failure), false);
  }
});

test('알 수 없는 공급자 오류 원문은 사용자에게 노출하지 않는다', () => {
  const secret = 'secret-app-key-and-location';
  const message = friendlyRouteError({ code: 'E_KNSDK_INIT', message: secret });
  assert.equal(message.includes(secret), false);
  assert.equal(friendlyRouteError({ code: 'E_KNSDK_ROUTE_20412' }), '경유지가 도로와 이어지지 않아요.');
  assert.match(friendlyRouteError('vendor text', '20413'), /자동차 전용도로/);
});
