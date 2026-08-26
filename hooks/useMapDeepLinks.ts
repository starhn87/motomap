import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { coordToAddress } from '@/lib/api/kakaoLocal';
import { fetchPlaceById } from '@/hooks/usePlace';
import { queryKeys } from '@/lib/queryKeys';
import type { Place } from '@/types';
import type { TempPlace } from '@/components/map/TempPlaceSheet';

// 지도 탭이 라우트 파라미터로 받는 진입 요청들을 소비한다.
// - focusPlaceId: 검색·푸시·내 리뷰·코스 근처 장소에서 온 "이 장소를 선택·포커스"
//   (focusTs 로 같은 장소 연속 선택도 구분, focusReviewId 는 리뷰 강조,
//    fromCourseId 는 "코스로 돌아가기" 칩의 복귀처)
// - kakao*: 검색의 일반 장소(카카오 로컬) — DB 에 없는 임시 목적지 핀
export function useMapDeepLinks({
  mapReady,
  isMapFocused,
  isMapPresented,
  onFollow,
  onSelectPlace,
  onSelectPoint,
  clearSelection,
}: {
  mapReady: boolean;
  /** 스택 아래에서 분리된 네이티브 지도에는 카메라 명령을 보내지 않는다 */
  isMapFocused: boolean;
  /** native-stack 전환이 끝나고 직전 지도 프레임이 실제로 노출된 상태 */
  isMapPresented: boolean;
  /** 안내 종료 직후 "내 위치 따라가기" 시작 — 지도 탭이 카메라 추적을 맡는다 */
  onFollow: () => void;
  /** DB 장소 포커스 — 지도 이동·시트 오픈까지 담당하는 기존 선택 핸들러 */
  onSelectPlace: (place: Place) => void;
  /** 카카오 일반 장소 포커스 — 바텀시트를 제외한 가시 지도 영역에 맞춘다 */
  onSelectPoint: (place: TempPlace) => void;
  /** 카카오 임시 핀을 띄우기 전 기존 장소 선택 해제 */
  clearSelection: () => void;
}) {
  const queryClient = useQueryClient();
  const { focusPlaceId, focusTs, focusReviewId, fromCourseId, kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone, kakaoId, kakaoUrl, generalPlaceId, followTs } =
    useLocalSearchParams<{
      focusPlaceId?: string;
      focusTs?: string;
      fromCourseId?: string;
      focusReviewId?: string;
      kakaoName?: string;
      kakaoAddress?: string;
      kakaoLat?: string;
      kakaoLng?: string;
      kakaoPhone?: string;
      kakaoId?: string;
      kakaoUrl?: string;
      generalPlaceId?: string;
      followTs?: string;
    }>();

  // 안내 종료 직후 "내 위치 따라가기" (lib/mapFocus.followMyLocationOnMap).
  // ⚠️ setLocationTrackingMode('Follow')를 쓰면 안 된다 — SDK 위치 오버레이가
  // 켜져 커스텀 내 위치 마커와 별개의 유령 마커가 뜬다(실기기 영상으로 확정).
  // 카메라 추적은 지도 탭(onFollow)이 커스텀 마커 체계 위에서 직접 한다.
  const handledFollowRef = useRef<string | null>(null);
  useEffect(() => {
    if (!followTs || !mapReady || !isMapFocused || !isMapPresented) return;
    if (handledFollowRef.current === followTs) return;
    handledFollowRef.current = followTs;
    onFollow();
  }, [followTs, mapReady, isMapFocused, isMapPresented, onFollow]);

  // 검색의 "일반 장소"(카카오 로컬) 선택 — DB 에 없는 임시 목적지
  const [tempPlace, setTempPlace] = useState<TempPlace | null>(null);
  const handledKakaoRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !kakaoName ||
      !kakaoLat ||
      !kakaoLng ||
      !mapReady ||
      !isMapFocused ||
      !isMapPresented
    ) return;
    const key = `${kakaoName}-${focusTs ?? ''}`;
    if (handledKakaoRef.current === key) return;
    handledKakaoRef.current = key;
    const place: TempPlace = {
      name: kakaoName,
      address: kakaoAddress ?? '',
      latitude: Number(kakaoLat),
      longitude: Number(kakaoLng),
      phone: kakaoPhone || undefined,
      providerId: kakaoId || undefined,
      placeUrl: kakaoUrl || undefined,
      generalPlaceId: generalPlaceId || undefined,
    };
    clearSelection();
    setTempPlace(place);
    // 주소 없이 오는 경우가 있다(미리보기의 기본 POI 탭) — 역지오코딩으로 채운다
    if (!place.address) {
      void coordToAddress(place.latitude, place.longitude).then((address) => {
        if (!address) return;
        setTempPlace((prev) =>
          prev && prev.name === place.name && prev.latitude === place.latitude
            ? { ...prev, address }
            : prev,
        );
      });
    }
    onSelectPoint(place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone, kakaoId, kakaoUrl, generalPlaceId, focusTs, mapReady, isMapFocused, isMapPresented]);

  const [highlightReview, setHighlightReview] = useState<{ id: string; key: string } | null>(
    null
  );
  // 코스 상세의 근처 장소에서 넘어온 경우 — 돌아갈 코스와 그 장소를 기억해
  // 시트가 열려 있는 동안 "코스로 돌아가기" 칩을 띄운다
  const [courseReturn, setCourseReturn] = useState<{ courseId: string; placeId: string } | null>(
    null
  );
  const handledFocusIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPlaceId || !mapReady || !isMapFocused || !isMapPresented) return;
    const focusKey = `${focusPlaceId}-${focusTs ?? ''}`;
    if (handledFocusIdRef.current === focusKey) return;
    handledFocusIdRef.current = focusKey;
    let cancelled = false;
    (async () => {
      // usePlace 와 같은 캐시 키 — 미리보기가 push 전에 심어 두면 왕복이 없다
      const place = await queryClient.ensureQueryData({
        queryKey: queryKeys.places.detail(focusPlaceId),
        queryFn: () => fetchPlaceById(focusPlaceId),
      });
      if (place && !cancelled) {
        setHighlightReview(focusReviewId ? { id: focusReviewId, key: focusKey } : null);
        setCourseReturn(fromCourseId ? { courseId: fromCourseId, placeId: place.id } : null);
        onSelectPlace(place);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusPlaceId, focusTs, focusReviewId, fromCourseId, mapReady, isMapFocused, isMapPresented, onSelectPlace, queryClient]);

  return {
    tempPlace,
    setTempPlace,
    highlightReview,
    setHighlightReview,
    courseReturn,
    setCourseReturn,
  };
}
