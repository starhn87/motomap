import type { AppDialog } from '@/lib/dialog';
import type { MyPlace, MyPlaceSlot } from '@/stores/useMyPlacesStore';

/** 목록 선택은 후보일 뿐이다. 명시적으로 확인한 경우에만 저장 콜백을 실행한다. */
export function createMyPlaceConfirmation(
  slot: MyPlaceSlot,
  place: MyPlace,
  onConfirm: () => void,
  onCancel: () => void,
): AppDialog {
  let settled = false;
  const settle = (action: () => void) => {
    if (settled) return;
    settled = true;
    action();
  };
  return {
    title: `${slot === 'home' ? '집으로' : '회사로'} 설정할까요?`,
    message: [place.name, place.address].filter(Boolean).join('\n'),
    maskMessage: true,
    buttons: [
      { text: '설정', onPress: () => settle(onConfirm) },
      { text: '취소', style: 'cancel', onPress: () => settle(onCancel) },
    ],
  };
}
