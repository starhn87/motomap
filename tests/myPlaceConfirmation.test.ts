import assert from 'node:assert/strict';
import test from 'node:test';
import { createMyPlaceConfirmation } from '@/lib/myPlaceConfirmation';

const place = { name: '테스트 장소', address: '테스트 주소', latitude: 37.5, longitude: 127 };

test('집·회사 선택 후보는 확인 전에는 저장하거나 이동하지 않는다', () => {
  for (const slot of ['home', 'work'] as const) {
    let saved = 0;
    const dialog = createMyPlaceConfirmation(slot, place, () => { saved += 1; }, () => {});
    assert.equal(saved, 0);
    assert.equal(dialog.title, slot === 'home' ? '집으로 설정할까요?' : '회사로 설정할까요?');
    assert.equal(dialog.message, '테스트 장소\n테스트 주소');
    assert.equal(dialog.maskMessage, true);
  }
});

test('설정 확인 콜백은 반복 탭에도 한 번만 실행한다', () => {
  let saved = 0;
  let navigated = 0;
  const dialog = createMyPlaceConfirmation('work', place, () => {
    saved += 1;
    navigated += 1;
  }, () => {});
  const confirm = dialog.buttons.find((button) => button.text === '설정')!;
  confirm.onPress?.();
  confirm.onPress?.();
  assert.equal(saved, 1);
  assert.equal(navigated, 1);
});

test('취소 후에는 저장·길찾기를 실행하지 않으며 목록 복귀만 한다', () => {
  let saved = 0;
  let cancelled = 0;
  const dialog = createMyPlaceConfirmation('home', place, () => { saved += 1; }, () => { cancelled += 1; });
  dialog.buttons.find((button) => button.style === 'cancel')!.onPress?.();
  dialog.buttons.find((button) => button.text === '설정')!.onPress?.();
  assert.equal(cancelled, 1);
  assert.equal(saved, 0);
});

test('주소가 없는 후보도 불필요한 빈 줄 없이 표시한다', () => {
  const dialog = createMyPlaceConfirmation('home', { ...place, address: '' }, () => {}, () => {});
  assert.equal(dialog.message, place.name);
});
