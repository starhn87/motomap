type Position = { coords: { latitude: number; longitude: number } };
type Heading = { trueHeading: number; magHeading: number; accuracy?: number };
type Subscription = { remove(): void };

// 이미 결정된 Android 권한을 다시 요청하면 Activity가 잠깐 비활성화될 수 있다.
export async function getOrRequestLocationPermission<T extends { status: string }>(
  read: () => Promise<T>,
  request: () => Promise<T>,
): Promise<T> {
  const permission = await read();
  return permission.status === 'undetermined' ? request() : permission;
}

// 지도 노출, 앱 활성, 길안내 소유권이 모두 맞을 때만 지도 센서를 사용한다.
export function shouldTrackUserLocation(enabled: boolean, appState: string | null, guiding: boolean): boolean {
  return enabled && appState === 'active' && !guiding;
}

export interface UserLocationSource {
  requestPermission(): Promise<{ status: string }>;
  lastKnown(): Promise<Position | null>;
  current(): Promise<Position>;
  watchPosition(callback: (position: Position) => void): Promise<Subscription>;
  watchHeading(callback: (heading: Heading) => void): Promise<Subscription>;
}

// 북쪽 경계를 가로질러도 최단 방향으로 보간한다. 작은 센서 잡음은 마커에 보내지 않는다.
export function smoothMapHeading(previous: number | null, sample: Heading): number | null {
  if (sample.accuracy === 0) return previous;
  const angle = Number.isFinite(sample.trueHeading) && sample.trueHeading >= 0
    ? sample.trueHeading : sample.magHeading;
  if (!Number.isFinite(angle) || angle < 0) return previous;
  const normalized = angle % 360;
  if (previous === null) return normalized;
  const delta = (normalized - previous + 540) % 360 - 180;
  if (Math.abs(delta) < 4) return previous;
  const weight = Math.min(0.55, 0.20 + Math.abs(delta) / 180);
  return (previous + delta * weight + 360) % 360;
}

// 화면 종료와 비동기 native 구독 생성의 경합을 한 수명 안에서 처리한다.
export function startUserLocationTracking(
  source: UserLocationSource,
  onPosition: (position: Position['coords']) => void,
  onHeading: (heading: number) => void,
  onUnavailable: (error: unknown) => void,
  trackHeading = true,
): () => void {
  let stopped = false;
  let positionSub: Subscription | null = null;
  let headingSub: Subscription | null = null;
  let shownHeading: number | null = null;

  const updatePosition = (position: Position) => {
    if (!stopped) onPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  };

  void (async () => {
    try {
      const { status } = await source.requestPermission();
      if (stopped || status !== 'granted') return;

      // 캐시 조회 실패는 최신 위치 조회를 막지 않는다.
      try {
        const lastKnown = await source.lastKnown();
        if (lastKnown) updatePosition(lastKnown);
      } catch {}
      if (stopped) return;

      const current = await source.current();
      if (stopped) return;
      updatePosition(current);

      const position = await source.watchPosition(updatePosition);
      if (stopped) {
        position.remove();
        return;
      }
      positionSub = position;
      // 경로 미리보기는 최신 위치만 필요하고 방향 센서는 사용하지 않는다.
      if (!trackHeading) return;

      const heading = await source.watchHeading((value) => {
        if (stopped) return;
        const next = smoothMapHeading(shownHeading, value);
        if (next !== null && next !== shownHeading) {
          shownHeading = next;
          onHeading(next);
        }
      });
      if (stopped) {
        heading.remove();
        return;
      }
      headingSub = heading;
    } catch (error) {
      if (!stopped) onUnavailable(error);
    }
  })();

  return () => {
    if (stopped) return;
    stopped = true;
    positionSub?.remove();
    headingSub?.remove();
    positionSub = null;
    headingSub = null;
  };
}
