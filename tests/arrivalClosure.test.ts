import assert from 'node:assert/strict';
import test from 'node:test';
import { describeArrivalClosure, type Hours } from '../lib/hours';

// 2026-11-02 월요일
const now = new Date(2026, 10, 2, 19, 0);
const at = (h: number, m = 0, day = 2) => new Date(2026, 10, day, h, m);
const weekday: Hours = { mon: [{ open: '11:00', close: '21:00' }], tue: [] };

test('도착 시각에 영업 중이거나 근거가 없으면 안내하지 않는다', () => {
  assert.equal(describeArrivalClosure({ hours: weekday }, at(20, 30), now), null);
  assert.equal(describeArrivalClosure({ hours: null }, at(20, 30), now), null);
  // 수요일은 시간표에 없다(모름) — 휴무로 추정하지 않는다
  assert.equal(describeArrivalClosure({ hours: weekday }, at(12, 0, 4), now), null);
});

test('도착 시각 기준 영업 종료·영업 전·휴무를 구분한다', () => {
  assert.equal(describeArrivalClosure({ hours: weekday }, at(21, 40), now), '도착 예정 21:40, 영업이 끝난 뒤예요.');
  assert.equal(describeArrivalClosure({ hours: weekday }, at(9, 5), new Date(2026, 10, 2, 8, 0)), '도착 예정 09:05, 11:00에 문을 열어요.');
  assert.equal(describeArrivalClosure({ hours: weekday }, at(1, 10, 3), now), '도착 예정 내일 01:10, 그날은 휴무예요.');
});

test('자정을 넘기는 영업은 다음 날 새벽 도착도 영업 중으로 본다', () => {
  const late: Hours = { mon: [{ open: '18:00', close: '02:00' }] };
  assert.equal(describeArrivalClosure({ hours: late }, at(1, 30, 3), now), null);
});

test('휴업·폐업 상태는 시간표보다 먼저 안내한다', () => {
  assert.equal(describeArrivalClosure({ hours: weekday, statusLabel: '임시 휴업' }, at(12), now), '임시 휴업 중이에요.');
  assert.equal(describeArrivalClosure({ statusLabel: '폐업' }, at(12), now), '폐업한 곳으로 표시돼 있어요.');
  assert.equal(describeArrivalClosure({ statusLabel: '이전' }, at(12), now), '다른 곳으로 이전한 것으로 표시돼 있어요.');
});
