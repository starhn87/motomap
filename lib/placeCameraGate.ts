type CameraTarget = { latitude: number; longitude: number; zoom: number };

// 오래된 카메라 idle 이벤트가 다음 장소 상세를 먼저 열지 못하게 한다.
export function createPlaceCameraGate(setPending: (pending: boolean) => void) {
  let target: CameraTarget | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function dispose() {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    target = undefined;
  }
  function finish() {
    if (!target) return;
    dispose();
    setPending(false);
  }
  return {
    begin(next: CameraTarget, duration: number) {
      dispose();
      target = next;
      setPending(true);
      // 이동이 생략되거나 SDK가 idle을 보내지 않아도 상세 열기는 완료한다.
      timeout = setTimeout(finish, duration + 48);
    },
    settled(camera: CameraTarget) {
      if (target &&
          Math.abs(camera.latitude - target.latitude) < 0.00012 &&
          Math.abs(camera.longitude - target.longitude) < 0.00012 &&
          Math.abs(camera.zoom - target.zoom) < 0.05) finish();
    },
    finish,
    dispose,
  };
}
