import { ScrollView } from 'react-native';
import { Text } from '@/components/ui/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import license from '@/assets/fonts/license.json';

export default function FontLicenseScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
    contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
    <Text selectable style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>{license.text}</Text>
  </ScrollView>;
}
