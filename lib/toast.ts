import Toast from 'react-native-toast-message';

// 상단 배치 — 하단은 탭바·바텀시트·키보드가 밀집해 토스트가 가려지거나 겹치고,
// 토스트를 부르는 버튼(저장·별표)도 대부분 하단이라 조작하는 손에 가린다.
// 상단 오프셋(Dynamic Island 회피)은 루트의 <Toast topOffset> 이 safe area 로 준다.
export const toast = {
  success: (message: string, description?: string) =>
    Toast.show({
      type: 'success',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 2500,
    }),
  error: (message: string, description?: string) =>
    Toast.show({
      type: 'error',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 3500,
    }),
  info: (message: string, description?: string) =>
    Toast.show({
      type: 'info',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 2500,
    }),
};
