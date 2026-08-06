import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NaverMapView, NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/constants/mapStyle';
import { useMapStore } from '@/stores/useMapStore';
import { track } from '@/lib/analytics';
import { usePlaces } from '@/hooks/usePlaces';
import { useGasStations, GAS_MIN_ZOOM, type SearchPoint } from '@/hooks/useGasStations';
import { useWeather } from '@/hooks/useWeather';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useMapDeepLinks } from '@/hooks/useMapDeepLinks';
import { setMapFocusOverride } from '@/lib/mapFocus';
import { useNearbyHazards } from '@/hooks/useHazards';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import CategoryFilter from '@/components/map/CategoryFilter';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  MARKER_IMAGES,
  MARKER_IMAGES_FAV,
  MARKER_IMAGES_CIRCLE,
  MARKER_IMAGES_CIRCLE_FAV,
  GENERAL_MARKER_CIRCLE_FAV,
  GENERAL_MARKER_FAV,
} from '@/constants/markerImages';
import { useQuery } from '@tanstack/react-query';
import { fetchFavoritePlaces, findGeneralFavorite } from '@/lib/api/favorites';
import { useAuthStore } from '@/stores/useAuthStore';
import PlaceBottomSheet from '@/components/map/PlaceBottomSheet';
import CourseReturnChip from '@/components/map/CourseReturnChip';
import GasStationMarker from '@/components/map/GasStationMarker';
import GasStationCard from '@/components/map/GasStationCard';
import WeatherFab from '@/components/map/WeatherFab';
import WeatherSheet from '@/components/map/WeatherSheet';
import * as Location from 'expo-location';

import KakaoNavi from '@/modules/kakao-navi';
import TempPlaceSheet, { type TempPlace } from '@/components/map/TempPlaceSheet';
import TempPlaceMarker from '@/components/map/TempPlaceMarker';
import HazardMarker from '@/components/map/HazardMarker';
import HazardSheet from '@/components/map/HazardSheet';
import { coordToAddress, searchKakaoLocal } from '@/lib/api/kakaoLocal';
import SearchEntry from '@/components/search/SearchEntry';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router , useLocalSearchParams } from 'expo-router';
import { UserLocationMarker } from '@/components/map/UserLocationMarker';
import { toast } from '@/lib/toast';
import type { Place, RoadHazard } from '@/types';
import type { GasStation } from '@/lib/api/gasStations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// 짧은 거리 근사(m) — 재검색 버튼 노출 판정용 (한국 위도대 경도 1도 ≈ 88km)
function approxMeters(a: SearchPoint, b: SearchPoint): number {
  return Math.hypot((a.latitude - b.latitude) * 111000, (a.longitude - b.longitude) * 88000);
}

// 장소 선택 시 하단 시트(첫 스냅 28%)가 마커를 가리지 않도록 카메라 중심을 남쪽으로
// 내려 마커를 화면 중심 살짝 위(≈45% 지점)에 둔다 — 상단 검색바·카테고리(≈18%)와
// 시트 위 경계(72%) 사이의 중앙. 웹 머카토르 근사: 화면 높이 비율 → 위도.
function sheetLatOffset(zoom: number, screenHeightDp: number, lat: number): number {
  const latSpan =
    (screenHeightDp / (256 * Math.pow(2, zoom))) * 360 * Math.cos((lat * Math.PI) / 180);
  return latSpan * 0.05;
}

// overlay: 스택 위에 오버레이로 떴을 때(place-preview) — 뒤로가기 버튼이 붙고,
// 닫으면 이전 화면(경로 미리보기 등)으로 돌아간다. 탭에서는 false.
export default function MapHome({ overlay = false }: { overlay?: boolean }) {
  // 초기 카메라용 좌표 — 딥링크 처리(useMapDeepLinks)와 별개로 첫 프레임에 필요
  const overlayParams = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    kakaoLat?: string;
    kakaoLng?: string;
    focusPlaceId?: string;
  }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { userLocation, selectedPlaceId, activeFilter, setSelectedPlaceId } =
    useMapStore();
  const { heading } = useUserLocation();

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number; zoom: number } | null>(null);
  const mapRef = useRef<NaverMapViewRef>(null);
  const cameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const didCenterOnUserRef = useRef(false);

  // 주유소 필터는 DB 대신 오피넷 실시간 유가 레이어를 켠다.
  // 지도 이동에 연동하지 않는 수동 갱신 모델 — 필터 진입 시 1회 검색하고, 이후에는
  // "현 지도에서 재검색" 버튼으로만 기준점을 옮긴다 (최저가 표시 고정 + 호출 절약).
  const gasMode = activeFilter === 'gas_station';
  const gasZoomOk = (mapCenter?.zoom ?? DEFAULT_ZOOM) >= GAS_MIN_ZOOM;
  const [selectedStation, setSelectedStation] = useState<GasStation | null>(null);
  const [gasSearchPoint, setGasSearchPoint] = useState<SearchPoint | null>(null);

  const { data: supabasePlaces } = usePlaces(activeFilter, mapCenter, !gasMode);
  const { data: hazards = [] } = useNearbyHazards(mapCenter);
  const [selectedHazard, setSelectedHazard] = useState<RoadHazard | null>(null);
  const { data: gasStations, isFetching: gasFetching } = useGasStations(
    gasSearchPoint,
    gasMode && mapReady,
  );

  // 라이딩 날씨 — 내 위치 우선, 없으면 지도 중심 기준
  const weatherLat = userLocation?.latitude ?? mapCenter?.latitude;
  const weatherLng = userLocation?.longitude ?? mapCenter?.longitude;
  const { data: weather, refetch: refetchWeather } = useWeather(weatherLat, weatherLng);
  const [weatherOpen, setWeatherOpen] = useState(false);

  // 시트를 여는 순간엔 캐시 신선도와 무관하게 서버에 재확인한다 — 발표분이 바뀌었으면
  // 즉시 반영되고, 같으면 EF 캐시가 같은 값을 돌려주므로 비용도 없다
  useEffect(() => {
    if (weatherOpen) void refetchWeather();
  }, [weatherOpen, refetchWeather]);

  // 필터 진입 시 현재 지도 중심으로 최초 1회 검색, 필터를 벗어나면 초기화
  useEffect(() => {
    if (!gasMode) {
      setSelectedStation(null);
      setGasSearchPoint(null);
      return;
    }
    if (!gasSearchPoint && mapCenter && gasZoomOk) {
      setGasSearchPoint({ latitude: mapCenter.latitude, longitude: mapCenter.longitude });
    }
  }, [gasMode, gasSearchPoint, mapCenter, gasZoomOk]);

  // 최초 1회: 지도가 준비되고 내 위치를 확보하면 카메라를 내 위치로 이동
  useEffect(() => {
    // 오버레이는 보러 온 장소가 주인공이다 — 위치가 도착했다고 카메라를 내
    // 위치로 뺏으면 장소→내 위치→장소로 두 번 튄다(실기기 보고)
    if (overlay || !mapReady || !userLocation || didCenterOnUserRef.current) return;
    // 딥링크 포커스를 들고 태어났다면(콜드 스타트 직후 검색 → 장소) 초기
    // 센터링 자체를 포기한다 — 내 위치를 경유했다가 장소로 가는 게 이것이었다
    if (overlayParams.focusPlaceId || overlayParams.kakaoLat) {
      didCenterOnUserRef.current = true;
      return;
    }
    didCenterOnUserRef.current = true;
    mapRef.current?.animateCameraTo({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: DEFAULT_ZOOM,
      duration: 0,
    });
  }, [mapReady, userLocation]);

  // 언마운트 시 카메라 타이머 정리
  useEffect(() => {
    return () => {
      if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
    };
  }, []);

  // 즐겨찾기 지도 표시 — 켜면 뷰포트·필터와 무관하게 즐겨찾기가 별 마커로 보인다.
  // 기존 클러스터 파이프라인에 합류시켜 탭·선택 강조가 그대로 동작한다.
  const showFavorites = useMapStore((s) => s.showFavorites);
  const toggleShowFavorites = useMapStore((s) => s.toggleShowFavorites);
  const user = useAuthStore((s) => s.user);
  const { data: favoritePlaces } = useQuery({
    queryKey: ['favorites', 'places', user?.id],
    queryFn: fetchFavoritePlaces,
    enabled: showFavorites && !!user,
  });
  const favIds = useMemo(
    () => new Set((favoritePlaces?.places ?? []).map((p) => p.id)),
    [favoritePlaces],
  );

  // 즐겨찾기는 클러스터에 넣지 않는다 — 줌아웃해도 묶이지 않고 이름 캡션과
  // 함께 개별 마커로 항상 보인다(네이버 지도식). 뷰포트 목록과 겹치면 제외.
  const basePlaces = gasMode ? [] : (supabasePlaces ?? []);
  const places = useMemo(
    () => (showFavorites ? basePlaces.filter((p) => !favIds.has(p.id)) : basePlaces),
    [basePlaces, showFavorites, favIds],
  );
  // 검색된 마커는 줌아웃해도 유지한다 — 기준점(gasSearchPoint)이 바뀔 때만 갱신
  const stations = gasMode ? (gasStations ?? []) : [];
  // 최저가 표시는 딱 하나 — 가격순(sort=1) 응답에서 최저가와 동가인 것 중 가장 가까운 곳
  const cheapestId = stations.length
    ? stations
        .filter((s) => s.price === stations[0].price)
        .reduce((a, b) => (a.distance <= b.distance ? a : b)).id
    : null;
  // 기준점에서 지도를 충분히 움직였을 때만 재검색 버튼 노출
  const gasMoved =
    gasMode && gasSearchPoint && mapCenter ? approxMeters(mapCenter, gasSearchPoint) > 300 : false;
  const showGasRefresh = gasMode && gasZoomOk && !!gasSearchPoint && (gasMoved || gasFetching);

  const handleMarkerPress = useCallback(
    (place: Place) => {
      track.placeViewed({ place_id: place.id, category: place.category, source: 'map_marker' });
      setHighlightReview(null);
      setTempPlace(null);
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
      // 현재 줌을 유지한 채 마커가 시트에 가리지 않는 위치로 카메라만 보정
      const zoom = mapCenter?.zoom ?? DEFAULT_ZOOM;
      mapRef.current?.animateCameraTo({
        latitude: place.latitude - sheetLatOffset(zoom, screenHeight, place.latitude),
        longitude: place.longitude,
        zoom,
        duration: 400,
      });
    },
    [setSelectedPlaceId, mapCenter, screenHeight]
  );

  const handleSearchSelect = useCallback(
    (place: Place) => {
      setSelectedPlaceId(place.id);
      setSelectedPlace(place);
      mapRef.current?.animateCameraTo({
        latitude: place.latitude - sheetLatOffset(15, screenHeight, place.latitude),
        longitude: place.longitude,
        zoom: 15,
        // 즉시 이동 — 이 함수는 검색·딥링크로 "다른 화면에서 돌아오며" 불린다.
        // 복귀 전환이 지도를 가리는 사이 끝나야 하고, 800ms 를 남기면 이전
        // 카메라(대개 내 위치)가 먼저 보였다가 흘러가는 게 그대로 노출된다.
        duration: 0,
      });
    },
    [setSelectedPlaceId, screenHeight]
  );

  // 라우트 파라미터(검색·푸시·내 리뷰·코스 근처 장소·카카오 일반 장소) 진입 처리
  const {
    tempPlace,
    setTempPlace,
    highlightReview,
    setHighlightReview,
    courseReturn,
    setCourseReturn,
  } = useMapDeepLinks({
    mapReady,
    mapRef,
    onFollow: () => {
      followingRef.current = true;
      handleMyLocation();
    },
    onSelectPlace: handleSearchSelect,
    clearSelection: () => {
      setSelectedPlaceId(null);
      setSelectedPlace(null);
    },
  });

  // 지금 고른 임시 장소가 즐겨찾기해 둔 일반 장소인지 — 마커를 핀으로 바꿀지 가른다
  const selectedGeneralFav = useMemo(
    () => (tempPlace ? findGeneralFavorite(favoritePlaces?.general ?? [], tempPlace) : undefined),
    [tempPlace, favoritePlaces],
  );

  const handleBottomSheetClose = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedPlace(null);
    setHighlightReview(null);
    setCourseReturn(null);
    // ✕/뒤로가기는 시트를 닫힘 애니메이션 없이 언마운트시켜 position 이 확장 값에
    // 동결된다(버튼 실종) — 닫힘 위치로 부드럽게 복귀시킨다. 스와이프 닫기처럼 이미
    // 닫힘 값에 도달한 경우엔 사실상 no-op 이다.
    sheetPosition.value = withTiming(containerHeight.value + 100, { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedPlaceId]);

  const handleMapTap = () => {
    Keyboard.dismiss();
    // 1단계: 열려 있는 카드·시트가 있으면 닫기만 한다 (지도 앱 관례)
    if (selectedPlace || selectedStation || tempPlace) {
      if (selectedPlace) handleBottomSheetClose();
      if (selectedStation) setSelectedStation(null);
      if (tempPlace) setTempPlace(null);
      return;
    }
    // 빈 지도를 탭하는 것으로는 아무것도 고르지 않는다. 예전엔 그 좌표를
    // 역지오코딩해 "선택한 위치" 카드를 띄웠는데, 도로에 붙지 않은 점이라
    // 길안내가 대개 실패한다(카카오가 `Not found origin link` 로 거절 — 실측).
    // 고르는 건 지도 심벌·등록 장소 마커·검색 결과에서만 일어난다.
  };

  // 네이버 지도가 그린 심벌(장소 아이콘·이름)을 탭 — 패치된 네이티브 이벤트라
  // 이름·좌표가 정확하다. 주소만 역지오코딩으로 뒤에서 채운다.
  const handleSymbolTap = ({
    latitude,
    longitude,
    caption,
  }: {
    latitude: number;
    longitude: number;
    caption: string;
  }) => {
    Keyboard.dismiss();
    // 주유소 모드에선 새 카드를 띄우지 않고 열려 있는 것만 닫는다
    if (gasMode) {
      if (selectedPlace) handleBottomSheetClose();
      if (selectedStation) setSelectedStation(null);
      if (tempPlace) setTempPlace(null);
      return;
    }
    // 다른 카드·시트가 열려 있어도 닫기 없이 새 심벌로 바로 전환한다 (지도 앱 관례)
    if (selectedPlace) handleBottomSheetClose();
    if (selectedStation) setSelectedStation(null);
    setTempPlace({ name: caption, address: '', latitude, longitude });
    void coordToAddress(latitude, longitude).then((address) => {
      if (!address) return;
      setTempPlace((prev) =>
        prev && prev.name === caption && prev.latitude === latitude
          ? { ...prev, address }
          : prev,
      );
    });
    // 전화번호는 심벌 이벤트에 없다 — 이름으로 검색해 같은 자리(150m 이내) 결과에서 채운다
    void searchKakaoLocal(caption).then((results) => {
      const match = results.find(
        (r) =>
          r.phone &&
          Math.hypot((r.latitude - latitude) * 111000, (r.longitude - longitude) * 88000) < 150,
      );
      if (!match) return;
      setTempPlace((prev) =>
        prev && prev.name === caption && prev.latitude === latitude
          ? { ...prev, phone: match.phone }
          : prev,
      );
    });
  };

  // 미리보기의 X 가 "맨 지도로 나가기"를 눌렀다 — 남아 있던 시트·카드를 접는다.
  // 오버레이 인스턴스는 곧 언마운트되니 탭 인스턴스만 반응하면 된다.
  const mapResetTs = useMapStore((st) => st.mapResetTs);
  const didMountResetRef = useRef(false);
  useEffect(() => {
    if (!didMountResetRef.current) {
      didMountResetRef.current = true;
      return;
    }
    if (overlay) return;
    handleBottomSheetClose();
    setTempPlace(null);
    setSelectedStation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapResetTs]);

  // 오버레이로 떠 있는 동안은 "지도에서 보기"류 이동(focusPlaceOnMap)을 탭
  // 전환 대신 이 라우트의 파라미터 갱신으로 돌린다 — 근처 장소를 눌러도
  // 미리보기 스택이 살아 있어야 뒤로 가기가 성립한다.
  useEffect(() => {
    if (!overlay) return;
    setMapFocusOverride((placeId, opts) => {
      router.setParams({
        focusPlaceId: placeId,
        focusTs: String(Date.now()),
        ...(opts?.reviewId ? { focusReviewId: opts.reviewId } : {}),
        ...(opts?.fromCourseId ? { fromCourseId: opts.fromCourseId } : {}),
      });
    });
    return () => setMapFocusOverride(null);
  }, [overlay]);

  // 탭바와 같은 프레스 감각 — 누르는 동안 움츠리고 떼면 한 번만 튕기며 복귀
  const myLocationScale = useSharedValue(1);
  const myLocationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: myLocationScale.value }],
  }));

  // 내 위치 버튼이 장소 시트의 실시간 위치를 따라 위로 밀려난다 (시트 위 16px).
  // 시트가 끝까지(100% 근처) 올라가면 페이드아웃. 닫히면 기본 위치로 자연 복귀.
  const sheetPosition = useSharedValue(999999);
  const containerHeight = useSharedValue(0);
  const myLocationFollowStyle = useAnimatedStyle(() => {
    const h = containerHeight.value;
    const fromSheet = h > 0 ? h - sheetPosition.value + 16 : 0;
    return {
      bottom: Math.max(24, fromSheet),
      opacity:
        h > 0
          ? interpolate(sheetPosition.value, [h * 0.2, h * 0.35], [0, 1], Extrapolation.CLAMP)
          : 1,
    };
  });
  const handleMyLocationPressIn = () => {
    myLocationScale.value = withTiming(0.85, { duration: 90 });
  };
  const handleMyLocationPressOut = () => {
    myLocationScale.value = withSequence(
      withTiming(1.05, { duration: 100, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 90, easing: Easing.inOut(Easing.quad) }),
    );
  };

  // 안내 종료 후 "내 위치 따라가기" — 위치 갱신마다 카메라가 따라가고,
  // 사용자가 지도를 드래그하면 풀린다. SDK 트래킹 모드는 쓰지 않는다(유령
  // 위치 오버레이 소환 — useMapDeepLinks 주석 참고).
  const followingRef = useRef(false);
  useEffect(() => {
    if (!followingRef.current || !userLocation) return;
    mapRef.current?.animateCameraTo({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      duration: 600,
    });
  }, [userLocation]);

  // 안내를 끝내고 돌아오면 지도는 안내를 시작할 때 보던 자리에 그대로 있다.
  // 그 화면이 잠깐 비쳤다가 내 위치로 튀므로, 안내 화면이 닫히는 동안 미리
  // 옮겨 둔다 — 애니메이션 없이 옮겨야 이동 자체가 안 보인다.
  //
  // 스토어의 userLocation 은 못 쓴다. 안내 중에는 우리 위치 구독을 통째로
  // 멈춰 두기 때문에(useUserLocation) 값이 출발지에 머물러 있다. 대신 KNSDK 가
  // 주행 내내 갱신해 둔 시스템 캐시를 읽는다 — 디스크 조회라 즉시 돌아온다.
  useEffect(() => {
    const sub = KakaoNavi.addListener('onGuideEnd', () => {
      void (async () => {
        const pos = await Location.getLastKnownPositionAsync();
        if (!pos) return;
        mapRef.current?.animateCameraTo({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          duration: 0,
        });
      })();
    });
    return () => sub.remove();
  }, []);

  const handleMyLocation = () => {
    if (!userLocation || !mapRef.current) return;
    // 내 위치를 지도 중앙으로 이동(현재 줌 유지)
    mapRef.current.animateCameraTo({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      zoom: mapCenter?.zoom ?? DEFAULT_ZOOM,
      duration: 600,
    });
  };

  // 오버레이는 딥링크 좌표를 이미 안다 — 기본 위치에서 800ms 카메라 이동을
  // 기다리지 말고 처음부터 그 자리에서 뜬다(전환 체감의 대부분이 이 이동이었다)
  const overlayLat = Number(overlayParams.lat ?? overlayParams.kakaoLat);
  const overlayLng = Number(overlayParams.lng ?? overlayParams.kakaoLng);
  const overlayTarget =
    overlay && Number.isFinite(overlayLat) && Number.isFinite(overlayLng)
      ? {
          // 선택 시 카메라가 앉는 자리와 같은 좌표로 시작해 딥링크의
          // animateCameraTo 가 사실상 제자리걸음이 되게 한다. 등록 장소만
          // 시트 오프셋을 받는다 — 일반 장소 카드는 보정 없이 중심이 규칙.
          latitude: overlayParams.focusPlaceId
            ? overlayLat - sheetLatOffset(15, screenHeight, overlayLat)
            : overlayLat,
          longitude: overlayLng,
          zoom: 15,
        }
      : null;
  const initialCamera = overlayTarget ?? {
    latitude: userLocation?.latitude ?? DEFAULT_CENTER[1],
    longitude: userLocation?.longitude ?? DEFAULT_CENTER[0],
    zoom: DEFAULT_ZOOM,
  };

  // 선택 강조는 별도 오버레이 마커가 맡는다 — selectedPlaceId 를 의존성에서 빼서
  // 마커 탭마다 클러스터 전체가 네이티브로 재전송·재계산되는 것을 막는다.
  // 선택된 장소는 별도 선택 마커가 뜨므로 목록에서 빼서 겹침(마커 2개)을 막는다.
  // 줌이 충분하면 장소를 개별 마커로 그려 이름 캡션을 함께 보여준다(클러스터
  // 마커는 캡션을 지원하지 않는다). 줌아웃하면 기존 클러스터로 돌아간다.
  // 즐겨찾기 캡션은 이 기준(10)보다 더 줌아웃한 8까지 남는다(네이버 지도식).
  // 겹침은 SDK(isHideCollidedCaptions/Symbols)가 정리하므로 낮은 줌도 난잡하지 않다.
  const CAPTION_ZOOM = 10;
  const FAV_CAPTION_MIN_ZOOM = 8;
  const zoom = mapCenter?.zoom ?? DEFAULT_ZOOM;
  const captionMode = zoom >= CAPTION_ZOOM;

  const clusterMarkers = useMemo(
    () =>
      captionMode
        ? []
        : places
            .filter((place) => place.id !== selectedPlaceId)
            .map((place) => ({
              identifier: place.id,
              latitude: place.latitude,
              longitude: place.longitude,
              image: MARKER_IMAGES[place.category],
              // 클러스터 마커는 앵커 지정이 안 돼(ClusterMarkerProp) 하단 중앙 고정 —
              // 꼬리 끝이 좌표를 찍는 핀을 그대로 쓴다. 원형은 개별 마커 전용.
              width: 32,
              height: 37,
            })),
    [captionMode, places, selectedPlaceId]
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        containerHeight.value = e.nativeEvent.layout.height;
      }}>
      <NaverMapView
        ref={mapRef}
        style={styles.map}
        onInitialized={() => setMapReady(true)}
        mapType="Basic"
        isNightModeEnabled={colorScheme === 'dark'}
        isShowLocationButton={false}
        isShowCompass
        isShowScaleBar={false}
        isShowZoomControls={false}
        initialCamera={initialCamera}
        locale="ko"
        isExtentBoundedInKorea
        onTapMap={handleMapTap}
        onTapSymbol={handleSymbolTap}
        onCameraChanged={(e) => {
          // 드래그하면 따라가기 해제 (프로그램 이동 'Developer' 는 유지)
          if (e.reason === 'Gesture') followingRef.current = false;
          if (cameraTimerRef.current) clearTimeout(cameraTimerRef.current);
          cameraTimerRef.current = setTimeout(() => {
            setMapCenter({
              latitude: e.latitude,
              longitude: e.longitude,
              zoom: e.zoom ?? 12,
            });
          }, 200);
        }}
        clusters={[
          {
            markers: clusterMarkers,
            screenDistance: 70,
            minZoom: 1,
            maxZoom: 16,
            animate: true,
          },
        ]}
        onTapClusterLeaf={({ markerIdentifier }) => {
          const place = places.find((p) => p.id === markerIdentifier);
          if (place) handleMarkerPress(place);
        }}>
        {userLocation && (
          <UserLocationMarker
            latitude={userLocation.latitude}
            longitude={userLocation.longitude}
            heading={heading}
          />
        )}

        {/* 장소 개별 마커 — 캡션 줌 이상에서 원형 마커 + 이름. 원은 핀보다 자리를
            덜 차지해 몰린 지역도 덜 답답하다. 겹치는 지도 심벌(기본 POI 텍스트)과
            캡션은 SDK 가 숨긴다. */}
        {captionMode &&
          places
            .filter((p) => p.id !== selectedPlaceId)
            .map((p) => (
              <NaverMapMarkerOverlay
                key={p.id}
                latitude={p.latitude}
                longitude={p.longitude}
                image={MARKER_IMAGES_CIRCLE[p.category]}
                width={30}
                height={30}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={10}
                isHideCollidedSymbols
                isHideCollidedCaptions
                caption={{
                  text: p.name,
                  textSize: 12,
                  color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
                  haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
                }}
                onTap={() => handleMarkerPress(p)}
              />
            ))}

        {/* 즐겨찾기 마커 — 클러스터 밖 개별 오버레이라 줌과 무관하게 항상 보인다.
            캡션은 일반(캡션 줌 10)보다 낮은 줌 8까지 남는다. */}
        {showFavorites &&
          (favoritePlaces?.places ?? [])
            .filter((p) => p.id !== selectedPlaceId)
            .map((p) => (
              <NaverMapMarkerOverlay
                key={p.id}
                latitude={p.latitude}
                longitude={p.longitude}
                image={MARKER_IMAGES_CIRCLE_FAV[p.category]}
                width={30}
                height={30}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={50}
                isHideCollidedSymbols
                isHideCollidedCaptions
                caption={{
                  text: p.name,
                  textSize: 13,
                  minZoom: FAV_CAPTION_MIN_ZOOM,
                  color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
                  haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
                }}
                onTap={() => handleMarkerPress(p)}
              />
            ))}

        {/* 등록되지 않은 일반 장소 즐겨찾기 — 카테고리가 없어 색으로 구분되지
            않는다(중립 회색 + 별). 탭하면 등록 장소 대신 임시 카드가 뜬다. */}
        {showFavorites &&
          (favoritePlaces?.general ?? [])
            // 고른 것은 아래에서 핀으로 다시 그린다 — 안 빼면 원형 위에 핀이 겹친다
            .filter((f) => !tempPlace || !findGeneralFavorite([f], tempPlace))
            .map((f) => (
            <NaverMapMarkerOverlay
              key={`fav-general-${f.id}`}
              latitude={f.latitude}
              longitude={f.longitude}
              image={GENERAL_MARKER_CIRCLE_FAV}
              width={30}
              height={30}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={50}
              isHideCollidedSymbols
              isHideCollidedCaptions
              caption={{
                text: f.name,
                textSize: 13,
                minZoom: FAV_CAPTION_MIN_ZOOM,
                color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
                haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
              }}
              onTap={() =>
                setTempPlace({
                  name: f.name,
                  address: f.address,
                  latitude: f.latitude,
                  longitude: f.longitude,
                  phone: f.phone,
                })
              }
            />
          ))}

        {/* 선택된 장소 강조 — 원형 대신 핀으로 바꿔 얹는다. 크기만 키우는 것보다
            대비가 커서 "이걸 골랐다"가 분명하다(네이버 지도식). */}
        {selectedPlace && (
          <NaverMapMarkerOverlay
            latitude={selectedPlace.latitude}
            longitude={selectedPlace.longitude}
            image={
              showFavorites && favIds.has(selectedPlace.id)
                ? MARKER_IMAGES_FAV[selectedPlace.category]
                : MARKER_IMAGES[selectedPlace.category]
            }
            width={38}
            height={44}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={100}
            isHideCollidedSymbols
            // 선택 마커는 원래 마커를 대신 그리는 것이라 캡션도 함께 가져온다.
            // 겹쳐도 숨기지 않는다 — 지금 보고 있는 곳의 이름은 늘 보여야 한다.
            caption={{
              text: selectedPlace.name,
              textSize: 12,
              color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
              haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
            }}
          />
        )}

        {/* 유가 마커 — 캡처된 비트맵이 재사용되므로 표시 내용(가격·최저)이 바뀌면 key 로 재캡처.
            stations 는 가격순이라 index 가 곧 겹침 생존 우선순위다 */}
        {stations.map((station, index) => (
          <GasStationMarker
            key={`${station.id}-${station.price}-${station.id === cheapestId}`}
            station={station}
            isCheapest={station.id === cheapestId}
            rank={index}
            onTap={setSelectedStation}
          />
        ))}

        {/* 일반 장소(임시 목적지) 핀 — 카테고리 마커와 구분되는 전용 디자인.
            즐겨찾기한 곳이면 깃발 대신 별 핀으로: 등록 장소와 같은 규칙(원형=미선택,
            핀=선택)이라야 "고른 것"이 한눈에 읽힌다. */}
        {tempPlace &&
          (selectedGeneralFav ? (
            <NaverMapMarkerOverlay
              latitude={tempPlace.latitude}
              longitude={tempPlace.longitude}
              image={GENERAL_MARKER_FAV}
              width={38}
              height={44}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={100}
              caption={{
                text: tempPlace.name,
                textSize: 13,
                color: colorScheme === 'dark' ? '#F9FAFB' : '#111827',
                haloColor: colorScheme === 'dark' ? '#111827' : '#FFFFFF',
              }}
            />
          ) : (
            <TempPlaceMarker latitude={tempPlace.latitude} longitude={tempPlace.longitude} />
          ))}

        {hazards.map((h) => (
          <HazardMarker key={h.id} hazard={h} onTap={() => setSelectedHazard(h)} />
        ))}
      </NaverMapView>


      {courseReturn && selectedPlaceId === courseReturn.placeId && (
        <CourseReturnChip
          onPress={() => {
            const courseId = courseReturn.courseId;
            handleBottomSheetClose();
            router.navigate(`/course/${courseId}`);
          }}
        />
      )}

      {overlay ? (
        /* 오버레이는 "이 장소가 뭔지 보고 돌아오는" 화면 — 검색·필터·길찾기는
           지도 탭의 일이라 걷어내고 뒤로가기만 남긴다 */
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.backButton,
            styles.backButtonOverlay,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} style={styles.searchAndFilter}>
          <View style={styles.searchRow}>
            <SearchEntry />
            <Pressable
              onPress={() => router.push('/directions')}
              style={[
                styles.directionsButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}>
              {/* 글리프의 세로 줄기가 왼쪽에 있어 시각 무게가 좌측으로 쏠린다 — 살짝 보정 */}
              <MaterialCommunityIcons
                name="arrow-right-top-bold"
                size={23}
                color={colors.tint}
                style={{ marginLeft: 2 }}
              />
            </Pressable>
          </View>
          <CategoryFilter />
        </Animated.View>
      )}

      {!overlay && weather && (
        <WeatherFab weather={weather} onPress={() => setWeatherOpen(true)} />
      )}

      {/* 즐겨찾기 지도 표시 — 날씨 FAB와 같은 행 오른쪽 끝, 켜면 별이 채워진다 */}
      {!overlay && (
      <Pressable
        onPress={() => {
          if (!user) {
            toast.info('로그인하면 즐겨찾기를 지도에서 볼 수 있어요');
            return;
          }
          toggleShowFavorites();
        }}
        style={[
          styles.favFab,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}>
        <Ionicons
          name={showFavorites ? 'star' : 'star-outline'}
          size={20}
          color={showFavorites ? '#FACC15' : colors.textSecondary}
        />
      </Pressable>
      )}

      {gasMode && !gasZoomOk && stations.length === 0 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.zoomHint, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.zoomHintText, { color: colors.text }]}>
            지도를 확대하면 주변 주유소 유가가 보여요
          </Text>
        </Animated.View>
      )}

      {showGasRefresh && (
        <AnimatedPressable
          entering={FadeIn.duration(200)}
          disabled={gasFetching}
          onPress={() => {
            if (!mapCenter) return;
            setSelectedStation(null);
            setGasSearchPoint({ latitude: mapCenter.latitude, longitude: mapCenter.longitude });
          }}
          style={[
            styles.gasRefreshButton,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <Text style={[styles.gasRefreshText, { color: colors.tint }]}>
            {gasFetching ? '검색 중...' : '↻ 현 지도에서 재검색'}
          </Text>
        </AnimatedPressable>
      )}

      <AnimatedPressable
        onPress={handleMyLocation}
        onPressIn={handleMyLocationPressIn}
        onPressOut={handleMyLocationPressOut}
        style={[
          styles.myLocationButton,
          myLocationStyle,
          myLocationFollowStyle,
          { backgroundColor: colors.background, shadowColor: '#000' },
        ]}>
        <View style={styles.myLocationIconContainer}>
          <View style={[styles.myLocationCrosshair, { borderColor: colors.tint }]}>
            <View style={[styles.myLocationCenter, { backgroundColor: colors.tint }]} />
          </View>
        </View>
      </AnimatedPressable>

      <PlaceBottomSheet
        place={selectedPlace}
        onClose={handleBottomSheetClose}
        animatedPosition={sheetPosition}
        highlightReview={highlightReview}
      />

      <HazardSheet hazard={selectedHazard} onClose={() => setSelectedHazard(null)} />

      {tempPlace && (
        <TempPlaceSheet place={tempPlace} onClose={() => setTempPlace(null)} />
      )}

      {selectedStation && (
        <GasStationCard
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}

      {weatherOpen && weather && (
        <WeatherSheet weather={weather} latitude={weatherLat} longitude={weatherLng} onClose={() => setWeatherOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  searchAndFilter: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 5,
    elevation: 5,
    gap: 0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonOverlay: {
    position: 'absolute',
    // 검색바와 같은 상단 기준(60) — 화면마다 눈높이가 안 바뀐다
    top: 60,
    left: 16,
    zIndex: 5,
    elevation: 5,
  },
  directionsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // 날씨 FAB(top 158, left 16, 52pt)와 같은 행의 오른쪽 끝 — 세로 중심을 맞춘다
  favFab: {
    position: 'absolute',
    top: 162,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 5,
  },
  zoomHint: {
    position: 'absolute',
    top: 170,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomHintText: {
    fontSize: 13,
    fontWeight: '600',
  },
  gasRefreshButton: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  gasRefreshText: {
    fontSize: 15,
    fontWeight: '700',
  },
  myLocationButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  myLocationIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationCrosshair: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
