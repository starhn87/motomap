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
import type { PlaceCategory } from '@/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FilterChip({
  label,
  icon,
  color,
  isActive,
  onPress,
}: {
  label: string;
  icon: string;
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
      <Text style={styles.chipIcon}>{icon}</Text>
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

export default function CategoryFilter() {
  const { activeFilter, setActiveFilter } = useMapStore();

  const handlePress = (key: PlaceCategory) => {
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
          icon={cat.icon}
          color={cat.color}
          isActive={activeFilter === cat.key}
          onPress={() => handlePress(cat.key)}
        />
      ))}
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
