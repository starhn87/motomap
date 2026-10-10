type Position = { coords: { latitude: number; longitude: number } };
type Heading = { trueHeading: number; magHeading: number };
type Subscription = { remove(): void };

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

// 화면 종료와 비동기 native 구독 생성의 경합을 한 수명 안에서 처리한다.
export function startUserLocationTracking(
  source: UserLocationSource,
  onPosition: (position: Position['coords']) => void,
  onHeading: (heading: number) => void,
  onUnavailable: () => void,
  trackHeading = true,
): () => void {
  let stopped = false;
  let positionSub: Subscription | null = null;
  let headingSub: Subscription | null = null;

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
        if (!stopped) onHeading(value.trueHeading >= 0 ? value.trueHeading : value.magHeading);
      });
      if (stopped) {
        heading.remove();
        return;
      }
      headingSub = heading;
    } catch {
      if (!stopped) onUnavailable();
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
