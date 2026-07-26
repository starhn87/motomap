import { Image } from 'expo-image';

// 앱의 바이크 아이콘 — 스플래시의 크루저 실루엣에서 뽑은 한 장을 모든 자리에서 쓴다.
// 폰트 아이콘(FontAwesome5 motorcycle 등)은 자리마다 생김새가 달라 보여 쓰지 않는다.
// 원본 512x296 비율을 유지하고 색은 tint 로 입혀 테마를 따른다.
const RATIO = 296 / 512;

export default function BikeIcon({ size, color }: { size: number; color?: string }) {
  return (
    <Image
      source={require('@/assets/images/bike-silhouette.png')}
      style={{ width: size, height: Math.round(size * RATIO) }}
      tintColor={color}
      contentFit="contain"
    />
  );
}
