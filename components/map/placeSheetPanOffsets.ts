import { Platform } from 'react-native';

// iOS 팬은 활성화 시 누적 이동량을 0으로 초기화하므로 세로 스와이프를 일찍 인식한다.
export const placeSheetOffsetY: [number, number] = Platform.OS === 'ios' ? [-4, 4] : [-12, 12];
// iOS는 한 터치 샘플에서 가로 실패를 먼저 판정한다. 빠른 세로 플릭의 좌우 흔들림을 허용한다.
export const placeSheetOffsetX: [number, number] = [-12, 12];
export const placeSheetHeaderOffsetX: [number, number] = [-16, 16];
