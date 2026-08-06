import MapHome from '@/components/map/MapHome';

// 경로 미리보기 위에 얹는 지도 오버레이 — 지도 탭과 같은 화면이라 검색·필터·
// 주유소·날씨·제보까지 전부 그대로다. 뒤로 가면 미리보기가 경로·옵션 그대로
// 남아 있다(스택이 지켜 준다). 딥링크 파라미터(focusPlaceId / kakao*)도 지도
// 탭과 동일하게 받는다 — useMapDeepLinks 가 라우트 무관하게 자기 params 를 읽는다.
export default function PlacePreviewScreen() {
  return <MapHome overlay />;
}
