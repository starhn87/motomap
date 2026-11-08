import { useLocalSearchParams } from 'expo-router';
import LocationPrivacyPanel from '@/components/LocationPrivacyPanel';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
export default function LocationPrivacyScreen() {
  const actor = useLocationPrivacyStore((s) => s.actor);
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <LocationPrivacyPanel key={actor ?? 'guest'} view={view === 'consent' || view === 'records' ? view : 'overview'} />;
}
