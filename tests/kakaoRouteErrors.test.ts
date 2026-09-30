import assert from 'node:assert/strict';
import test from 'node:test';

import { friendlyRouteError, routeErrorCode } from '../lib/kakaoRouteErrors';

test('KNSDK 오류 문구가 바뀌어도 코드로 경로 실패를 구분한다', () => {
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE_20413', message: 'vendor text' }), 20413);
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE_20412' }), 20412);
  assert.equal(routeErrorCode({ code: 'E_KNSDK_ROUTE' }), null);
});

test('알 수 없는 공급자 오류 원문은 사용자에게 노출하지 않는다', () => {
  const secret = 'secret-app-key-and-location';
  const message = friendlyRouteError({ code: 'E_KNSDK_INIT', message: secret });
  assert.equal(message.includes(secret), false);
  assert.equal(friendlyRouteError({ code: 'E_KNSDK_ROUTE_20412' }), '경유지가 도로와 이어지지 않아요.');
  assert.match(friendlyRouteError('vendor text', '20413'), /자동차 전용도로/);
});
