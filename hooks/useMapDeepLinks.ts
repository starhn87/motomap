import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { NaverMapViewRef } from '@mj-studio/react-native-naver-map';

import { fetchPlaceById } from '@/hooks/usePlace';
import type { Place } from '@/types';
import type { TempPlace } from '@/components/map/TempPlaceSheet';

// 지도 탭이 라우트 파라미터로 받는 진입 요청들을 소비한다.
// - focusPlaceId: 검색·푸시·내 리뷰·코스 근처 장소에서 온 "이 장소를 선택·포커스"
//   (focusTs 로 같은 장소 연속 선택도 구분, focusReviewId 는 리뷰 강조,
//    fromCourseId 는 "코스로 돌아가기" 칩의 복귀처)
// - kakao*: 검색의 일반 장소(카카오 로컬) — DB 에 없는 임시 목적지 핀
export function useMapDeepLinks({
  mapReady,
  mapRef,
  onSelectPlace,
  clearSelection,
}: {
  mapReady: boolean;
  mapRef: React.RefObject<NaverMapViewRef | null>;
  /** DB 장소 포커스 — 지도 이동·시트 오픈까지 담당하는 기존 선택 핸들러 */
  onSelectPlace: (place: Place) => void;
  /** 카카오 임시 핀을 띄우기 전 기존 장소 선택 해제 */
  clearSelection: () => void;
}) {
  const { focusPlaceId, focusTs, focusReviewId, fromCourseId, kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone } =
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
    }>();

  // 검색의 "일반 장소"(카카오 로컬) 선택 — DB 에 없는 임시 목적지
  const [tempPlace, setTempPlace] = useState<TempPlace | null>(null);
  const handledKakaoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!kakaoName || !kakaoLat || !kakaoLng || !mapReady) return;
    const key = `${kakaoName}-${focusTs ?? ''}`;
    if (handledKakaoRef.current === key) return;
    handledKakaoRef.current = key;
    const place: TempPlace = {
      name: kakaoName,
      address: kakaoAddress ?? '',
      latitude: Number(kakaoLat),
      longitude: Number(kakaoLng),
      phone: kakaoPhone || undefined,
    };
    clearSelection();
    setTempPlace(place);
    mapRef.current?.animateCameraTo({
      latitude: place.latitude,
      longitude: place.longitude,
      zoom: 15,
      duration: 800,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoName, kakaoAddress, kakaoLat, kakaoLng, kakaoPhone, focusTs, mapReady]);

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
    if (!focusPlaceId || !mapReady) return;
    const focusKey = `${focusPlaceId}-${focusTs ?? ''}`;
    if (handledFocusIdRef.current === focusKey) return;
    handledFocusIdRef.current = focusKey;
    let cancelled = false;
    (async () => {
      const place = await fetchPlaceById(focusPlaceId);
      if (place && !cancelled) {
        setHighlightReview(focusReviewId ? { id: focusReviewId, key: focusKey } : null);
        setCourseReturn(fromCourseId ? { courseId: fromCourseId, placeId: place.id } : null);
        onSelectPlace(place);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusPlaceId, focusTs, focusReviewId, fromCourseId, mapReady, onSelectPlace]);

  return {
    tempPlace,
    setTempPlace,
    highlightReview,
    setHighlightReview,
    courseReturn,
    setCourseReturn,
  };
}
