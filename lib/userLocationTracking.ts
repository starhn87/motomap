type Position = { coords: { latitude: number; longitude: number } };
type Heading = { trueHeading: number; magHeading: number };
type Subscription = { remove(): void };

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
