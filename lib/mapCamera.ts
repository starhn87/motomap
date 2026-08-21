export interface MapCameraSnapshot {
  latitude: number;
  longitude: number;
  zoom: number;
  tilt: number;
  bearing: number;
}

// 네이티브 지도가 실제로 새로 마운트되는 예외 경로에서도 직전 카메라를 initialCamera로
// 쓸 수 있게 보관한다. React 상태로 구독하면 카메라 이동 프레임마다 화면 전체가 다시
// 렌더되므로 모듈 메모리에만 두고 필요한 순간에 읽는다.
let lastMapCamera: MapCameraSnapshot | null = null;
let mainMapFocused = false;

export function setLastMapCamera(camera: MapCameraSnapshot) {
  lastMapCamera = { ...camera };
}

export function getLastMapCamera(): MapCameraSnapshot | null {
  return lastMapCamera ? { ...lastMapCamera } : null;
}

export function setMainMapFocused(focused: boolean) {
  mainMapFocused = focused;
}

export function isMainMapFocused(): boolean {
  return mainMapFocused;
}
