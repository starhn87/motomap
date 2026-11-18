import { isLoaded } from 'expo-font';

// 새 바이너리에 등록된 서체만 사용한다. 이전 설치본은 시스템 서체를 유지한다.
export const APP_FONT_FAMILY = isLoaded('Pretendard-Regular') || isLoaded('Pretendard')
  ? 'Pretendard' : undefined;
export const APP_FONT_STYLE = APP_FONT_FAMILY ? { fontFamily: APP_FONT_FAMILY } : {};
