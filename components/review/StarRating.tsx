import { View, StyleSheet, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

interface Props {
  rating: number;
  onRate?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

export default function StarRating({
  rating,
  onRate,
  size = 24,
  readonly = false,
}: Props) {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => !readonly && onRate?.(star)}
          disabled={readonly}
          activeOpacity={readonly ? 1 : 0.6}>
          <Text
            style={[
              styles.star,
              { fontSize: size, color: star <= rating ? '#FBBF24' : '#D1D5DB' },
            ]}>
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
  },
  star: {
    lineHeight: undefined,
  },
});
