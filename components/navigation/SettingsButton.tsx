import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import GlassButton from '@/components/ui/GlassButton';

export default function SettingsButton() {
  const colors = Colors[useColorScheme() ?? 'light'];
  return <GlassButton accessibilityRole="button" accessibilityLabel="설정" onPress={() => router.push('/settings')}
    style={styles.button}>
      <Ionicons name="settings-outline" size={22} color={colors.text} />
  </GlassButton>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
});
