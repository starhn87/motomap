import { Stack, useLocalSearchParams } from 'expo-router';
import LocationPrivacyPanel from '@/components/LocationPrivacyPanel';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
export default function LocationPrivacyScreen() {
  const actor = useLocationPrivacyStore((s) => s.actor);
  const { view } = useLocalSearchParams<{ view?: string }>();
  const screen = view === 'consent' || view === 'records' ? view : 'overview';
  const title = screen === 'consent' ? '동의 범위 변경'
    : screen === 'records' ? '내 기록 열람·삭제' : '위치정보 관리';
  return <>
    <Stack.Screen options={{ title }} />
    <LocationPrivacyPanel key={actor ?? 'guest'} view={screen} />
  </>;
}
