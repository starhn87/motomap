import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { formatDistance, formatDuration } from '@/lib/api/directions';
import { openNavigation } from '@/lib/navigation';
import type { Route } from '@/lib/api/directions';
import type { Place } from '@/types';

interface Props {
  route: Route;
  place: Place;
  onClose: () => void;
}

export default function RouteInfoCard({ route, place, onClose }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutDown.duration(200)}
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {formatDistance(route.distance)}
          </Text>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
            거리
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.infoItem}>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {formatDuration(route.duration)}
          </Text>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
            예상 시간
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.cancelButton,
            {
              backgroundColor: colorScheme === 'dark' ? '#2A2A2A' : '#F3F4F6',
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            openNavigation({
              name: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
            })
          }
          style={({ pressed }) => [
            styles.startButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}>
          <Text style={styles.startText}>네비 시작</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 12,
  },
  divider: {
    width: 1,
    height: 32,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  startButton: {
    flex: 2,
    backgroundColor: '#18181B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
