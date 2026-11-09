import { haversine } from './distance';

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

function readHeading(sample: Heading): number | null {
  if (sample.accuracy === 0) return null;
  const angle = Number.isFinite(sample.trueHeading) && sample.trueHeading >= 0
    ? sample.trueHeading : sample.magHeading;
  return Number.isFinite(angle) && angle >= 0 ? angle % 360 : null;
}

const headingDelta = (from: number, to: number) => (to - from + 540) % 360 - 180;

// 북쪽을 최단 방향으로 지나고, 큰 회전은 연속 두 샘플이 맞을 때부터 표시한다.
export function smoothMapHeading(previous: number | null, sample: Heading, preceding?: Heading): number | null {
  const angle = readHeading(sample);
  if (angle === null) return previous;
  if (previous === null) return angle;
  const delta = headingDelta(previous, angle);
  if (Math.abs(delta) < 4) return previous;
  if (Math.abs(delta) > 55) {
    const last = preceding ? readHeading(preceding) : null;
    if (last === null || Math.abs(headingDelta(last, angle)) > 25) return previous;
  }
  const weight = Math.min(0.55, 0.20 + Math.abs(delta) / 180);
  return (previous + delta * weight + 360) % 360;
}

export function markerHeadingMotion(from: number, to: number) {
  const delta = headingDelta(from, to);
  if (delta === 0) return null;
  return (progress: number) => (from + delta * progress + 360) % 360;
}

export function markerPositionMotion(from: Position['coords'], to: Position['coords']) {
  const distance = haversine(from, to);
  // 오래된 캐시에서 최신 위치로 크게 바뀌면 중간 좌표를 그리지 않는다.
  if (!(distance > 0 && distance <= 100)) return null;
  return (progress: number) => ({
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: (from.longitude + headingDelta(from.longitude, to.longitude) * progress + 540) % 360 - 180,
  });
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
  let precedingHeading: Heading | undefined;

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
        const next = smoothMapHeading(shownHeading, value, precedingHeading);
        precedingHeading = value;
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
