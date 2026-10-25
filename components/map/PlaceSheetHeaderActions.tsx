import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { TouchableOpacity } from 'react-native-gesture-handler';

import CloseIcon from '@/components/ui/CloseIcon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors, { semantic } from '@/constants/Colors';

interface Props {
  expanded: boolean;
  isFavorite: boolean;
  favoriteDisabled?: boolean;
  favoriteScale: SharedValue<number>;
  onFavorite: () => void;
  onClose: () => void;
}

export default function PlaceSheetHeaderActions({
  expanded,
  isFavorite,
  favoriteDisabled,
  favoriteScale,
  onFavorite,
  onClose,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const favoriteStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));
  const buttonStyle = [styles.iconButton, expanded && styles.pageHeaderIconButton];
  const iconSize = expanded ? 24 : 22;

  return (
    <>
      <TouchableOpacity
        accessibilityLabel={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite, disabled: !!favoriteDisabled }}
        onPress={onFavorite}
        disabled={favoriteDisabled}
        style={buttonStyle}>
        <Animated.View style={favoriteStyle}>
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={iconSize}
            color={isFavorite ? semantic.star : expanded ? colors.text : colors.textSecondary}
          />
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="장소 상세 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={buttonStyle}>
        <CloseIcon
          size={iconSize}
          color={expanded ? colors.text : colors.textSecondary}
        />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeaderIconButton: {
    width: 44,
    height: 44,
  },
});
