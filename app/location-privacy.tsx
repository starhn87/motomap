import LocationPrivacyPanel from '@/components/LocationPrivacyPanel';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';
export default function LocationPrivacyScreen() {
  const actor = useLocationPrivacyStore((s) => s.actor);
  return <LocationPrivacyPanel key={actor ?? 'guest'} />;
}
