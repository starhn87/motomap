import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getProfile, updateBikeModel } from '@/lib/nickname';
import { searchBikeModels } from '@/constants/bikes';
import { toast } from '@/lib/toast';

// 마이 바이크 — 기종 자기 신고. 리뷰에 "OO 라이더" 뱃지로 표시된다.
export default function EditBikeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 자동완성 — 목록에서 고른 직후에는 드롭다운을 다시 열지 않는다
  const [picked, setPicked] = useState(false);
  // 입력과 정확히 같은 항목은 제외 — 타이핑으로 완성한 경우 중복 표시 방지
  const suggestions = picked ? [] : searchBikeModels(model).filter((s) => s !== model.trim());

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile?.bike_model) {
        setModel(profile.bike_model);
        // 저장된 기종은 이미 확정된 값 — 재진입 시 자기 자신이 드롭다운에 뜨지 않게
        setPicked(true);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateBikeModel(model);
      toast.success(
        model.trim() ? '내 바이크가 등록되었습니다.' : '내 바이크가 해제되었습니다.',
      );
      router.back();
    } catch (error: any) {
      toast.error('저장에 실패했습니다.', error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.container, { backgroundColor: colors.background }]}
      onPress={Keyboard.dismiss}>
      <Text style={[styles.label, { color: colors.text }]}>내 바이크 기종</Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="예: CB650R, R7, 슈퍼커브110"
          placeholderTextColor={colors.textSecondary}
          value={model}
          onChangeText={(text) => {
            setModel(text);
            setPicked(false);
          }}
          maxLength={30}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        {model.length > 0 && (
          <Pressable
            hitSlop={8}
            onPress={() => {
              setModel('');
              setPicked(false);
            }}>
            <Text style={[styles.clearText, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        )}
      </View>

      {suggestions.length > 0 && (
        <ScrollView
          style={[
            styles.suggestions,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
          // 키보드가 떠 있어도 항목을 바로 탭할 수 있어야 한다 (없으면 첫 탭이 키보드 닫기에 먹힘)
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                setModel(s);
                setPicked(true);
                Keyboard.dismiss();
              }}
              style={({ pressed }) => [
                styles.suggestionItem,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.suggestionText, { color: colors.text }]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        입력하면 인기 기종이 자동완성돼요. 목록에 없는 기종은 그대로 입력해도 됩니다.
        등록하면 내가 쓴 리뷰에 기종 뱃지가 표시돼요.
      </Text>

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
        style={[styles.saveButton, { backgroundColor: colors.tint, opacity: saving ? 0.6 : 1 }]}>
        {saving ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={[styles.saveText, { color: colors.background }]}>저장</Text>
        )}
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
    padding: 4,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    // 4개 반이 보이는 높이 — 잘린 항목이 스크롤 가능함을 암시하고 키보드에 안 가린다
    maxHeight: 198,
    flexGrow: 0,
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
