import assert from 'node:assert/strict';
import test from 'node:test';

import { isJwtIssuedAtFutureError } from '../lib/authRestoreError';

test('PostgREST의 JWT future 오류만 일시 재시도 대상으로 분류한다', () => {
  assert.equal(
    isJwtIssuedAtFutureError({
      code: 'PGRST303',
      message: 'JWT issued at future',
    }),
    true,
  );
  assert.equal(
    isJwtIssuedAtFutureError({
      code: 'PGRST303',
      message: 'JWT expired',
    }),
    false,
  );
  assert.equal(
    isJwtIssuedAtFutureError({
      code: '42501',
      message: 'JWT issued at future',
    }),
    false,
  );
  assert.equal(isJwtIssuedAtFutureError(new Error('JWT issued at future')), false);
});
