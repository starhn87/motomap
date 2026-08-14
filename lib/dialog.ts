import { create } from 'zustand';

// 앱 다이얼로그 — 네이티브 Alert 대체. Alert 은 버튼이 가로로 붙어 비좁고
// (사용자 피드백) 앱 팔레트도 못 따른다. 시그니처를 Alert.alert 에 맞춰
// 사용처는 함수만 바꾸면 된다. 렌더는 루트의 DialogHost 가 맡는다.
// 전화(tel:)처럼 OS 가 띄우는 확인은 대상이 아니다.

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AppDialog {
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** 리플레이 마스킹 — 메시지에 집 주소 같은 민감 정보가 실릴 때 켠다 */
  maskMessage?: boolean;
}

interface DialogState {
  dialog: AppDialog | null;
  show: (dialog: AppDialog) => void;
  hide: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  hide: () => set({ dialog: null }),
}));

/** Alert.alert 대체 — 버튼을 안 주면 [확인] 하나 */
export function appAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: { maskMessage?: boolean },
) {
  useDialogStore.getState().show({
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: '확인' }],
    maskMessage: options?.maskMessage,
  });
}
