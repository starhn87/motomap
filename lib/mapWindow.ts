export interface MapCenter {
  latitude: number;
  longitude: number;
  zoom: number;
  region?: {
    // 네이버 지도 SDK의 region 좌표는 중심이 아니라 남서쪽 모서리다.
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

// 실제 화면보다 가로·세로를 50% 넓게 유지해 드래그 중 가장자리 마커가
// 뒤늦게 나타나는 것을 줄인다. 카메라가 멈출 때만 이 창을 갱신한다.
export const MAP_WINDOW_OVERSCAN = 1.5;

const METERS_PER_LATITUDE_DEGREE = 111_320;

function longitudeMetersPerDegree(latitude: number): number {
  return METERS_PER_LATITUDE_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

export function mapRenderWindowRadius(center: MapCenter): number | null {
  const region = center.region;
  if (!region || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return null;

  const halfHeight = (region.latitudeDelta / 2) * METERS_PER_LATITUDE_DEGREE;
  const regionCenterLatitude = region.latitude + region.latitudeDelta / 2;
  const halfWidth =
    (region.longitudeDelta / 2) * longitudeMetersPerDegree(regionCenterLatitude);
  return Math.hypot(halfHeight, halfWidth) * MAP_WINDOW_OVERSCAN;
}

export function isInMapRenderWindow(
  coordinate: Coordinate,
  center?: MapCenter | null,
): boolean {
  const region = center?.region;
  if (!region || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return true;

  // region.latitude/longitude는 남서쪽 모서리다. 이를 그대로 중심으로 쓰면
  // 실제 화면의 북쪽·동쪽 25%가 1.5배 overscan 창에서도 빠진다.
  const regionCenterLatitude = region.latitude + region.latitudeDelta / 2;
  const regionCenterLongitude = region.longitude + region.longitudeDelta / 2;
  const latitudeMargin = (region.latitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  const longitudeMargin = (region.longitudeDelta * MAP_WINDOW_OVERSCAN) / 2;
  return (
    Math.abs(coordinate.latitude - regionCenterLatitude) <= latitudeMargin &&
    Math.abs(coordinate.longitude - regionCenterLongitude) <= longitudeMargin
  );
}
