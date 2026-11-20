import LocationPrivacyPanel from '@/components/LocationPrivacyPanel';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';

export default function LocationPrivacyRecordsScreen() {
  const actor = useLocationPrivacyStore((state) => state.actor);
  return <LocationPrivacyPanel key={actor ?? 'guest'} view="records" />;
}
