import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Pressable,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { getProfile, updateBikeModel } from '@/lib/nickname';
import { toast } from '@/lib/toast';

// 마이 바이크 — 기종 자기 신고. 리뷰에 "OO 라이더" 뱃지로 표시된다.
export default function EditBikeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile?.bike_model) setModel(profile.bike_model);
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
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
        placeholder="예: CB650R, R7, 슈퍼커브110"
        placeholderTextColor={colors.textSecondary}
        value={model}
        onChangeText={setModel}
        maxLength={30}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        등록하면 내가 쓴 리뷰에 기종 뱃지가 표시돼요. 비우고 저장하면 해제됩니다.
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
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
