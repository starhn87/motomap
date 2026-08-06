import MapHome from '@/components/map/MapHome';

// 지도 탭 — 화면 본체는 MapHome. 경로 미리보기의 오버레이(place-preview)와
// 같은 컴포넌트를 쓰기 때문에 지도 기능은 두 곳에서 항상 동일하다.
export default function MapTab() {
  return <MapHome />;
}
