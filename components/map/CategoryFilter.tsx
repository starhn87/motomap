import CategoryIcon from '@/components/ui/CategoryIcon';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { CATEGORY_LIST } from '@/constants/categories';
import Colors from '@/constants/Colors';
import { useMapStore } from '@/stores/useMapStore';
import { track } from '@/lib/analytics';
import type { PlaceCategory } from '@/types';
import { haptics } from '@/lib/haptics';
import Ionicons from '@expo/vector-icons/Ionicons';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FilterChip({
  label,
  categoryKey,
  color,
  isActive,
  onPress,
}: {
  label: string;
  categoryKey: PlaceCategory;
  color: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.chip,
        animatedStyle,
        {
          backgroundColor: isActive
            ? color
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#FFFFFF',
          borderColor: isActive ? color : colors.border,
        },
      ]}>
      <CategoryIcon category={categoryKey} size={15} color={isActive ? '#FFFFFF' : color} />
      <Text
        style={[
          styles.chipLabel,
          { color: isActive ? '#FFFFFF' : colors.text },
        ]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function RiderShareFilterChip({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[
        styles.chip,
        animatedStyle,
        {
          backgroundColor: isActive
            ? colors.text
            : colorScheme === 'dark'
              ? '#1A1A1A'
              : '#FFFFFF',
          borderColor: isActive ? colors.text : colors.border,
        },
      ]}>
      <Ionicons
        name={isActive ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={16}
        color={isActive ? colors.background : colors.text}
      />
      <Text style={[styles.chipLabel, { color: isActive ? colors.background : colors.text }]}>
        추천 장소
      </Text>
    </AnimatedPressable>
  );
}

export default function CategoryFilter() {
  const activeFilter = useMapStore((state) => state.activeFilter);
  const setActiveFilter = useMapStore((state) => state.setActiveFilter);
  const showRiderShares = useMapStore((state) => state.showRiderShares);
  const toggleRiderShares = useMapStore((state) => state.toggleRiderShares);

  const handlePress = (key: PlaceCategory) => {
    haptics.selection(50);
    // 끄는 동작은 세지 않는다 — 무엇을 보려 했는지가 관심사다
    if (activeFilter !== key) track.categoryFiltered({ category: key });
    setActiveFilter(activeFilter === key ? null : key);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {CATEGORY_LIST.map((cat) => (
        <FilterChip
          key={cat.key}
          label={cat.label}
          categoryKey={cat.key}
          color={cat.color}
          isActive={activeFilter === cat.key}
          onPress={() => handlePress(cat.key)}
        />
      ))}
      <RiderShareFilterChip
        isActive={showRiderShares}
        onPress={() => {
          haptics.selection(50);
          track.generalSharedLayerToggled({ on: !showRiderShares });
          toggleRiderShares();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 4,
  },
  chip: {
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
