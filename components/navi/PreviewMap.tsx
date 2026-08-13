import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapMultiPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';

import { approxMeters } from '@/lib/distance';
import { latLngsFromFlat, type BikeRoute } from '@/modules/kakao-navi';
import type { NavTarget } from '@/lib/navigation';
import type { TrafficPart } from '@/lib/api/directions';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import { usePlaces } from '@/hooks/usePlaces';
import { useFavorites } from '@/hooks/useFavorites';
import {
  BLANK_MARKER,
  VIA_MARKERS,
  MARKER_IMAGES,
  MARKER_IMAGES_FAV,
  GENERAL_MARKER_FAV,
} from '@/constants/markerImages';
import { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { track } from '@/lib/analytics';

// 혼잡도별 경로선 색 — 막힐수록 붉게. 원활은 기존 경로색, 정보 없음은 회색.
// 서행은 semantic.warning(amber-600)보다 밝은 amber-500 — 지도 위 가시성 우선.
const TRAFFIC_COLORS: Record<number, string> = {
  4: semantic.success, // 원활
  3: '#F59E0B', // 서행
  2: semantic.danger, // 지체
  1: '#B91C1C', // 정체
  0: '#9CA3AF', // 정보 없음
};

// 미리보기 지도 — 경로선(혼잡색), 출발 도트, 경유지 번호, 경로 주변의 등록
// 장소·즐겨찾기 마커까지 이 안에서 그린다. 화면(NaviScreen)은 지점과 경로만
// 넘기고, 뷰포트 필터링·마커 탭 라우팅·카메라 핏은 지도의 일이다.
export default function PreviewMap({
  start,
  goal,
  viaMarkers,
  route,
  trafficParts,
  isCourseMode,
  topCardH,
  bottomCardH,
}: {
  /** [lng, lat] — 출발 도트를 찍을 자리. null 이면 아직 확보 전 */
  start: [number, number] | null;
  goal: NavTarget;
  /** 실제 요청에 쓰인 경유지만 — 20412 폴백으로 빠진 지점은 안 그린다 */
  viaMarkers: { latitude: number; longitude: number }[];
  route: BikeRoute | undefined;
  trafficParts: TrafficPart[] | undefined;
  isCourseMode: boolean;
  /** 위아래 카드가 지도를 덮는 픽셀 — 카메라 핏이 이 값만큼 경로를 밀어 넣는다 */
  topCardH: React.RefObject<number>;
  bottomCardH: React.RefObject<number>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const mapRef = useRef<NaverMapViewRef>(null);

  // 경로 주변의 등록 장소·즐겨찾기 — "가는 길에 들를 곳"을 미리보기에서 보여준다.
  // 탭하면 시트가 미리보기 위로 열리고, 닫으면 경로·옵션 상태 그대로 돌아온다.
  const { data: allPlaces } = usePlaces(null, null, true);
  const { data: favorites } = useFavorites();
  // 화면에 보이는 영역(SW + delta). 카메라가 멈출 때만 갱신된다
  const [viewport, setViewport] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  // 폴리라인은 수천 좌표라 리렌더마다 새로 만들면 네이티브 브리지로 통째로
  // 재전송된다 — 경로가 바뀔 때만 변환하고, 혼잡도 색 경로가 있으면 단색용
  // coords 는 아예 만들지 않는다.
  const coords = useMemo(
    () =>
      route && route.polyline.length >= 4 && !trafficParts
        ? latLngsFromFlat(route.polyline)
        : null,
    [route, trafficParts],
  );
  const pathParts = useMemo(
    () =>
      trafficParts?.map((p) => ({
        coords: p.coords,
        color: TRAFFIC_COLORS[p.state] ?? semantic.success,
        outlineColor: '#FFFFFF',
      })),
    [trafficParts],
  );

  // 화면에 보이는 장소·즐겨찾기만 그린다 — 전량을 뿌리면 전국 뷰에서 마커가
  // 수백 개가 되고, 뷰포트 기준이면 카메라가 멈출 때만 다시 거른다.
  const visibleOnMap = useMemo(() => {
    if (!viewport) return { places: [], favs: [] };
    // 가장자리 걸친 마커가 뚝 사라지지 않게 10% 여유
    const latPad = viewport.latitudeDelta * 0.1;
    const lngPad = viewport.longitudeDelta * 0.1;
    const south = viewport.latitude - latPad;
    const north = viewport.latitude + viewport.latitudeDelta + latPad;
    const west = viewport.longitude - lngPad;
    const east = viewport.longitude + viewport.longitudeDelta + lngPad;
    const inView = (lat: number, lng: number) =>
      lat >= south && lat <= north && lng >= west && lng <= east;

    // 등록 장소·즐겨찾기는 경로 지점(출발·경유·도착)이어도 저 자신의 마커로
    // 보인다 — 정체성은 이 레이어가, 역할은 위에 겹치는 출발 도트·경유지
    // 번호(중앙 앵커라 핀 발치에 얹힌다)가 맡는다. 예전엔 겹침을 피해 뺐는데,
    // 그러면 도착지가 즐겨찾기한 카페여도 중립 핀으로만 보였다(실사용 피드백).
    const places = (allPlaces ?? []).filter((pl) => inView(pl.latitude, pl.longitude));
    const favs = (favorites?.general ?? []).filter((f) => inView(f.latitude, f.longitude));
    return { places, favs };
  }, [viewport, allPlaces, favorites]);
  const favoriteIds = useMemo(() => new Set(favorites?.placeIds ?? []), [favorites]);

  // 도착지 자리에 등록 장소·즐겨찾기 마커가 이미 있으면 슬레이트 핀은 접는다 —
  // 하단 앵커 핀 두 장이 같은 좌표에 겹치면 위 것만 보여 그리는 의미가 없고,
  // 그 장소의 진짜 마커가 정체성을 더 잘 말해 준다. 10m: 같은 DB 좌표만 매칭
  // (더 넓히면 옆 가게 핀을 도착지로 오독할 수 있다).
  const goalCovered = useMemo(() => {
    const near = (lat: number, lng: number) =>
      approxMeters({ latitude: lat, longitude: lng }, goal) < 10;
    return (
      visibleOnMap.places.some((pl) => pl.id === goal.placeId || near(pl.latitude, pl.longitude)) ||
      visibleOnMap.favs.some((f) => near(f.latitude, f.longitude))
    );
  }, [visibleOnMap, goal]);

  // 개별 마커 onTap 은 이 화면에서 이벤트가 JS 로 올라오지 않았다(실측).
  // 지도 탭이 쓰는 클러스터 + onTapClusterLeaf 경로가 검증돼 있어 그대로 따른다.
  // 클러스터 마커는 앵커 지정이 안 돼 핀(하단 중앙 고정)을 쓴다 — 지도 탭과 동일.
  const previewClusterMarkers = useMemo(
    () => [
      ...visibleOnMap.places.map((pl) => ({
        identifier: `place:${pl.id}`,
        latitude: pl.latitude,
        longitude: pl.longitude,
        image: favoriteIds.has(pl.id)
          ? MARKER_IMAGES_FAV[pl.category]
          : MARKER_IMAGES[pl.category],
        width: 32,
        height: 37,
      })),
      ...visibleOnMap.favs.map((f) => ({
        identifier: `fav:${f.id}`,
        latitude: f.latitude,
        longitude: f.longitude,
        image: GENERAL_MARKER_FAV,
        width: 32,
        height: 37,
      })),
    ],
    [visibleOnMap, favoriteIds],
  );

  // 경로가 바뀌면 전체가 보이도록 카메라를 맞춘다.
  // 남쪽은 하단 카드가 덮는 만큼 더 벌린다.
  useEffect(() => {
    if (!route || route.polyline.length < 4) return;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (let i = 0; i + 1 < route.polyline.length; i += 2) {
      const lng = route.polyline[i];
      const lat = route.polyline[i + 1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lngSpan = Math.max(maxLng - minLng, 0.01);
    // 카드 밖에 남는 세로 밴드에 경로가 통째로 들어가야 한다. 카드 높이는
    // 화면 픽셀이라, 경로 폭과 무관하게 "가려지는 비율"로 환산해 벌린다.
    const screenH = Dimensions.get('window').height;
    const topH = isCourseMode ? insets.top + 60 : topCardH.current;
    const bottomH = bottomCardH.current;
    const visibleFrac = Math.max(0.25, (screenH - topH - bottomH) / screenH);
    const fullSpan = latSpan / visibleFrac;
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: {
        latitude: minLat - fullSpan * (bottomH / screenH) - latSpan * 0.04,
        longitude: minLng - lngSpan * 0.1,
      },
      coord2: {
        latitude: maxLat + fullSpan * (topH / screenH) + latSpan * 0.04,
        longitude: maxLng + lngSpan * 0.1,
      },
      duration: 700,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isCourseMode 는 파라미터에서 파생돼 불변
  }, [route]);

  // 탭하면 그 장소가 선택된 지도 화면을 통째로 오버레이한다(/place-preview).
  // 뒤로 가면 이 미리보기가 경로·옵션 그대로 남아 있다 — 스택이 지켜 준다.
  const handleSymbolTap = ({
    latitude,
    longitude,
    caption,
  }: {
    latitude: number;
    longitude: number;
    caption: string;
  }) => {
    router.push({
      pathname: '/place-preview',
      params: {
        kakaoName: caption,
        kakaoLat: String(latitude),
        kakaoLng: String(longitude),
        focusTs: String(Date.now()),
      },
    });
  };

  const handleClusterLeafTap = (markerIdentifier: string) => {
    if (markerIdentifier.startsWith('place:')) {
      const pl = visibleOnMap.places.find((x) => `place:${x.id}` === markerIdentifier);
      if (!pl) return;
      track.placeViewed({ place_id: pl.id, category: pl.category, source: 'route_preview' });
      // 오버레이가 fetch 없이 바로 시트를 열도록 usePlace 캐시를 미리 채운다
      queryClient.setQueryData(['place', pl.id], pl);
      // lat/lng 는 오버레이 초기 카메라용 — 장소 fetch 전 첫 프레임에 쓴다
      router.push({
        pathname: '/place-preview',
        params: {
          focusPlaceId: pl.id,
          focusTs: String(Date.now()),
          lat: String(pl.latitude),
          lng: String(pl.longitude),
        },
      });
      return;
    }
    const f = visibleOnMap.favs.find((x) => `fav:${x.id}` === markerIdentifier);
    if (!f) return;
    router.push({
      pathname: '/place-preview',
      params: {
        kakaoName: f.name,
        kakaoAddress: f.address,
        kakaoLat: String(f.latitude),
        kakaoLng: String(f.longitude),
        kakaoPhone: f.phone ?? '',
        focusTs: String(Date.now()),
      },
    });
  };

  return (
    <NaverMapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      mapType="Basic"
      isNightModeEnabled={colorScheme === 'dark'}
      isShowLocationButton={false}
      isShowCompass={false}
      isShowScaleBar={false}
      isShowZoomControls={false}
      locale="ko"
      // 위치 오버레이를 강제로 끈다 — 재활용된 지도 뷰가 지도 탭의 오버레이
      // 상태를 물려받아 고아 위치 마커가 화면에 남았다(실기기 영상으로 확정)
      locationOverlay={{ isVisible: false }}
      // 미리보기라고 지도를 잠글 이유가 없다 — 확대해서 경로 주변을 살피는 화면이다
      isZoomGesturesEnabled
      isScrollGesturesEnabled
      isRotateGesturesEnabled
      isTiltGesturesEnabled
      onCameraIdle={(e) => setViewport(e.region)}
      clusters={[
        {
          markers: previewClusterMarkers,
          screenDistance: 70,
          minZoom: 1,
          maxZoom: 16,
          animate: true,
        },
      ]}
      onTapClusterLeaf={({ markerIdentifier }) => handleClusterLeafTap(markerIdentifier)}
      onTapSymbol={handleSymbolTap}
      initialCamera={{ latitude: goal.latitude, longitude: goal.longitude, zoom: 12 }}>
      {start && (
        // 출발점 도트 — children 커스텀 뷰는 캡처용 네이티브 뷰가 화면에
        // 고아로 남는 문제가 있어(실기기: 좌표에 안 붙고 떠다니는 잔상)
        // 정적 이미지로 그린다.
        <NaverMapMarkerOverlay
          latitude={start[1]}
          longitude={start[0]}
          width={18}
          height={18}
          anchor={{ x: 0.5, y: 0.5 }}
          image={require('@/assets/images/origin-dot.png')}
        />
      )}
      {pathParts ? (
        // 혼잡도 색 경로 — 선형도 색과 같은 REST 응답 것을 쓴다(색·선 불일치 방지)
        <NaverMapMultiPathOverlay pathParts={pathParts} width={6} outlineWidth={2} />
      ) : coords ? (
        <NaverMapPathOverlay
          coords={coords}
          width={6}
          color={semantic.success}
          outlineWidth={2}
          outlineColor="#FFFFFF"
        />
      ) : null}
      {/* 이름 캡션 — 클러스터 마커는 캡션을 지원하지 않아(ClusterMarkerProp)
          같은 좌표에 투명 마커 + caption 만 얹는다. 탭은 클러스터 leaf 가 계속
          받는다(이 화면은 개별 마커 onTap 이 JS 로 안 올라온다, 실측).
          줌 기준·스타일은 지도 탭과 동일 — 장소 10, 즐겨찾기 8 부터. */}
      {[
        ...visibleOnMap.places.map((pl) => ({
          key: `cap-place:${pl.id}`,
          latitude: pl.latitude,
          longitude: pl.longitude,
          name: pl.name,
          minZoom: 10,
          textSize: 12,
        })),
        ...visibleOnMap.favs.map((f) => ({
          key: `cap-fav:${f.id}`,
          latitude: f.latitude,
          longitude: f.longitude,
          name: f.name,
          minZoom: 8,
          textSize: 13,
        })),
      ].map((c) => (
        <NaverMapMarkerOverlay
          key={c.key}
          latitude={c.latitude}
          longitude={c.longitude}
          width={4}
          height={4}
          anchor={{ x: 0.5, y: 0.5 }}
          image={BLANK_MARKER}
          isHideCollidedCaptions
          caption={{
            text: c.name,
            textSize: c.textSize,
            minZoom: c.minZoom,
            color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
            haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
          }}
        />
      ))}
      {viaMarkers.map((v, i) => (
        <NaverMapMarkerOverlay
          key={`via-${i}-${v.latitude}-${v.longitude}`}
          latitude={v.latitude}
          longitude={v.longitude}
          width={26}
          height={26}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={80}
          image={VIA_MARKERS[Math.min(i, VIA_MARKERS.length - 1)]}
        />
      ))}
      {!goalCovered && (
        <TempPlaceMarker latitude={goal.latitude} longitude={goal.longitude} />
      )}
    </NaverMapView>
  );
}
