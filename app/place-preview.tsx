import { useEffect } from 'react';

import MapHome from '@/components/map/MapHome';
import { pushMapOverlayDepth, popMapOverlayDepth } from '@/lib/mapFocus';

// 경로 미리보기 위에 얹는 지도 오버레이 — 지도 본체(마커·POI·시트)는 지도 탭과
// 같고, 검색·필터 같은 탭 전용 UI 만 빠진다. 뒤로 가면 미리보기가 경로·옵션
// 그대로 남아 있다(스택이 지켜 준다). 딥링크 파라미터(focusPlaceId / kakao*)도
// 지도 탭과 동일하게 받는다 — useMapDeepLinks 가 라우트 무관하게 params 를 읽는다.
export default function PlacePreviewScreen() {
  useEffect(() => {
    pushMapOverlayDepth();
    return () => popMapOverlayDepth();
  }, []);
  return <MapHome overlay />;
}
