import CategoryIcon from '@/components/ui/CategoryIcon';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { CATEGORY_LIST } from '@/constants/categories';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMapStore } from '@/stores/useMapStore';
import { toast } from '@/lib/toast';
import type { PlaceCategory } from '@/types';

// 즐겨찾기 별 뱃지와 같은 노랑 (markers/*_fav.png)
const FAV_YELLOW = '#FACC15';

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

export default function CategoryFilter() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { activeFilter, setActiveFilter, showFavorites, toggleShowFavorites } = useMapStore();
  const user = useAuthStore((s) => s.user);

  const handlePress = (key: PlaceCategory) => {
    setActiveFilter(activeFilter === key ? null : key);
  };

  // 즐겨찾기 지도 표시 토글 — 로그인해야 즐겨찾기가 있다
  const handleFavorites = () => {
    if (!user) {
      toast.info('로그인하면 즐겨찾기를 지도에서 볼 수 있어요');
      return;
    }
    toggleShowFavorites();
  };

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        style={styles.scroll}>
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
      </ScrollView>
      {/* 즐겨찾기 별 — 칩 행 오른쪽에 고정, 켜면 별이 채워진다 */}
      <Pressable
        onPress={handleFavorites}
        hitSlop={6}
        style={[
          styles.favChip,
          {
            backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF',
            borderColor: showFavorites ? FAV_YELLOW : colors.border,
          },
        ]}>
        <Ionicons
          name={showFavorites ? 'star' : 'star-outline'}
          size={17}
          color={showFavorites ? FAV_YELLOW : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 4,
  },
  favChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
