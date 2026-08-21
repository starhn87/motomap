export interface MapCameraSnapshot {
  latitude: number;
  longitude: number;
  zoom: number;
  tilt: number;
  bearing: number;
}

// 네이티브 지도는 검색 화면 아래에서 분리됐다가 다시 붙을 수 있다. React 상태로
// 구독하면 카메라 이동 프레임마다 화면 전체가 다시 렌더되므로, 복원 전용 스냅샷은
// 모듈 메모리에만 보관하고 필요한 순간에 읽는다.
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
