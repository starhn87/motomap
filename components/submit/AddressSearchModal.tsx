import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { searchKakaoLocal, type KakaoLocalResult } from '@/lib/api/kakaoLocal';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: KakaoLocalResult) => void;
}

// 상호·주소로 검색해 좌표까지 확보하는 모달. 제보 폼(장소·코스 경유지)에서 공용.
export default function AddressSearchModal({ visible, onClose, onSelect }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KakaoLocalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const r = await searchKakaoLocal(query);
    setResults(r);
    setSearched(true);
    setLoading(false);
  };

  const handleSelect = (item: KakaoLocalResult) => {
    onSelect(item);
    reset();
    onClose();
  };

  const reset = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>주소 검색</Text>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={10}>
            <Text style={[styles.close, { color: colors.textSecondary }]}>닫기</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="상호 또는 주소 (예: 카페 모토라드)"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          <Pressable onPress={handleSearch} style={[styles.searchBtn, { backgroundColor: colors.tint }]}>
            <Text style={[styles.searchBtnText, { color: colors.background }]}>검색</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.tint} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.placeName}-${i}`}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {searched ? '검색 결과가 없습니다.' : '상호나 주소로 검색하세요.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                <Text style={[styles.resultName, { color: colors.text }]}>{item.placeName}</Text>
                <Text style={[styles.resultAddr, { color: colors.textSecondary }]}>
                  {item.roadAddress || item.address}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700' },
  close: { fontSize: 15 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  searchBtn: {
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 15, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  resultRow: { paddingVertical: 14, borderBottomWidth: 1 },
  resultName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  resultAddr: { fontSize: 13 },
});
