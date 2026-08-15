import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { RIDER_FACTS, type RiderFactCode } from '@/constants/riderFacts';
import { useColorScheme } from '@/components/useColorScheme';
import { usePlaceRiderFacts, useTogglePlaceRiderFact } from '@/hooks/useRiderInsights';
import { track } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/useAuthStore';

export default function RiderPlaceFacts({ placeId }: { placeId: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const user = useAuthStore((state) => state.user);
  const { data = [] } = usePlaceRiderFacts(placeId);
  const toggle = useTogglePlaceRiderFact(placeId);

  const byCode = new Map(data.map((fact) => [fact.code, fact]));

  const handlePress = (code: RiderFactCode) => {
    if (!user) {
      toast.info('로그인하면 직접 확인한 정보를 남길 수 있어요.');
      return;
    }
    if (toggle.isPending) return;
    const current = byCode.get(code);
    track.riderFactToggled({ fact: code, on: !current?.confirmedByMe });
    toggle.mutate(code, {
      onError: (error) => toast.error('장소 정보를 반영하지 못했습니다.', error.message),
    });
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>라이더 장소 정보</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>직접 확인한 항목을 눌러 알려주세요</Text>
      <View style={styles.facts}>
        {RIDER_FACTS.map((definition) => {
          const fact = byCode.get(definition.code);
          const selected = !!fact?.confirmedByMe;
          return (
            <Pressable
              key={definition.code}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={toggle.isPending}
              onPress={() => handlePress(definition.code)}
              style={({ pressed }) => [
                styles.fact,
                {
                  backgroundColor: selected ? colors.tint + '18' : colors.surfaceMuted,
                  borderColor: selected ? colors.tint : colors.border,
                  opacity: pressed || toggle.isPending ? 0.72 : 1,
                },
              ]}>
              <Ionicons
                name={definition.icon}
                size={15}
                color={selected ? colors.tint : colors.textSecondary}
              />
              <Text
                style={[
                  styles.factText,
                  { color: selected ? colors.tint : colors.text },
                ]}>
                {definition.label}
              </Text>
              {!!fact?.confirmations && (
                <Text
                  style={[
                    styles.count,
                    { color: selected ? colors.tint : colors.textSecondary },
                  ]}>
                  {fact.confirmations}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    marginBottom: 2,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  fact: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
  },
  factText: {
    fontSize: 12,
    fontWeight: '600',
  },
  count: {
    fontSize: 11,
    fontWeight: '800',
  },
});
