import CategoryIcon from '@/components/ui/CategoryIcon';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';
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
  const isDark = colorScheme === 'dark';
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
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.chip,
        animatedStyle,
        {
          backgroundColor: isActive
            ? color
            : colors.background,
          borderColor: isActive ? color : colors.border,
        },
        isDark && (isActive ? styles.darkChipSelected : styles.darkChip),
      ]}>
      <CategoryIcon category={categoryKey} size={15} color={isActive && !isDark ? '#FFFFFF' : color} />
      <Text
        style={[
          styles.chipLabel,
          { color: isActive ? '#FFFFFF' : colors.text },
          isDark && (isActive ? styles.darkChipLabelSelected : styles.darkChipLabel),
        ]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function RiderShareFilterChip({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const labelColor = isDark ? (isActive ? '#FFFFFF' : '#E4E4E7') : (isActive ? colors.background : colors.text);
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
            : colors.background,
          borderColor: isActive ? colors.text : colors.border,
        },
        isDark && (isActive ? styles.darkChipSelected : styles.darkChip),
      ]}>
      <Ionicons
        name={isActive ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={16}
        color={labelColor}
      />
      <Text style={[styles.chipLabel, { color: labelColor }]}>
        추천 장소
      </Text>
    </AnimatedPressable>
  );
}

export default function CategoryFilter() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const activeFilter = useMapStore((state) => state.activeFilter);
  const premiumGasOnly = useMapStore((state) => state.premiumGasOnly);
  const togglePremiumGasOnly = useMapStore((state) => state.togglePremiumGasOnly);
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
    <View pointerEvents="box-none">
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
      {activeFilter === 'gas_station' && (
        <View pointerEvents="box-none" style={styles.subfilters}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="고급휘발유 판매 주유소만 보기"
            accessibilityState={{ checked: premiumGasOnly }}
            onPress={() => {
              haptics.selection(50);
              togglePremiumGasOnly();
            }}
            style={({ pressed }) => [styles.chip, styles.subfilterChip, {
              backgroundColor: premiumGasOnly ? colors.tint : colors.background,
              borderColor: premiumGasOnly ? colors.tint : colors.border,
              opacity: pressed ? 0.65 : 1,
            }]}>
            <Ionicons
              name={premiumGasOnly ? 'checkbox' : 'square-outline'}
              size={16}
              color={premiumGasOnly ? colors.background : colors.text}
            />
            <Text numberOfLines={1} style={[styles.chipLabel, { flexShrink: 1, color: premiumGasOnly ? colors.background : colors.text }]}>
              고급휘발유만
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  darkChip: {
    backgroundColor: '#24262B',
    borderColor: '#41444B',
  },
  darkChipSelected: {
    backgroundColor: '#3A3D44',
    borderColor: '#62666E',
  },
  darkChipLabel: { color: '#E4E4E7' },
  darkChipLabelSelected: { color: '#FFFFFF' },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 4,
  },
  subfilters: {
    // 좌우의 날씨·즐겨찾기 버튼 자리를 비우고 가운데에만 터치 영역을 둔다.
    paddingHorizontal: 80,
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: 'center',
  },
  subfilterChip: {
    minHeight: 44,
    maxWidth: '100%',
  },
  chip: {
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
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
