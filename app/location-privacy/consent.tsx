import { useNavigation } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import LegalConsentScreen from '@/components/auth/LegalConsentScreen';
import { useLocationPrivacyStore } from '@/stores/useLocationPrivacyStore';

export default function LocationPrivacyConsentScreen() {
  const navigation = useNavigation();
  const actor = useLocationPrivacyStore((state) => state.actor);

  return <PostHogMaskView style={{ flex: 1 }}>
    <LegalConsentScreen key={actor ?? 'guest'} needsLegal={false} showProvidersInline onComplete={() => {
      if (navigation.isFocused() && navigation.canGoBack()) navigation.goBack();
    }} />
  </PostHogMaskView>;
}
