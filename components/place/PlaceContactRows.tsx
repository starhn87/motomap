import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { canCopyAddress, copyAddress } from '@/lib/addressClipboard';
import { toast } from '@/lib/toast';

export function PlaceAddressRow({ address }: { address: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const copy = async () => {
    try {
      if (!await copyAddress(address)) throw Error('copy_unavailable');
      toast.success('주소를 복사했어요.');
    } catch { toast.error('주소를 복사하지 못했어요. 다시 시도해 주세요.'); }
  };
  return (
    <View style={styles.addressRow}>
      <Text selectable style={[styles.address, { color: colors.textSecondary }]} numberOfLines={1}>{address}</Text>
      {canCopyAddress && !!address.trim() && (
        <Pressable accessibilityRole="button" accessibilityLabel="주소 복사" onPress={() => void copy()}
          style={({ pressed }) => [styles.copy, { opacity: pressed ? 0.6 : 1 }]}>
          <Ionicons name="copy-outline" size={17} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

export function PlacePhoneRow({ phone }: { phone?: string | null }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  if (!phone) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`전화 ${phone}`}
      onPress={() => void Linking.openURL(`tel:${phone}`).catch(() => toast.info('전화를 걸 수 없어요.'))}
      style={({ pressed }) => [styles.phoneRow, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="call-outline" size={17} color={colors.textSecondary} />
      <Text style={{ color: colors.text, fontSize: 14 }}>{phone}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  address: { flexShrink: 1, fontSize: 15, lineHeight: 22 },
  copy: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
});
