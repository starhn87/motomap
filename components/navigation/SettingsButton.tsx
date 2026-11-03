import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import GlassSurface from '@/components/ui/GlassSurface';

export default function SettingsButton() {
  const colors = Colors[useColorScheme() ?? 'light'];
  return <Pressable accessibilityRole="button" accessibilityLabel="설정" onPress={() => router.push('/settings')}
    style={({ pressed }) => ({ marginRight: 12, opacity: pressed ? 0.7 : 1 })}>
    <GlassSurface style={styles.button}>
      <Ionicons name="settings-outline" size={22} color={colors.text} />
    </GlassSurface>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
