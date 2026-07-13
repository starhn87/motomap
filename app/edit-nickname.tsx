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

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  generateRandomNickname,
  checkNicknameAvailable,
  getProfile,
} from '@/lib/nickname';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

export default function EditNicknameScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [nickname, setNickname] = useState('');
  const [currentNickname, setCurrentNickname] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile) {
        setNickname(profile.nickname);
        setCurrentNickname(profile.nickname);
      }
      setLoading(false);
    })();
  }, []);

  const handleRandom = () => {
    setNickname(generateRandomNickname());
    setStatus('idle');
  };

  const handleCheck = async () => {
    if (!nickname.trim()) {
      toast.info('닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length < 2 || nickname.trim().length > 15) {
      toast.info('닉네임은 2~15자여야 합니다.');
      return;
    }
    if (nickname.trim() === currentNickname) {
      setStatus('available');
      return;
    }

    setStatus('checking');
    const available = await checkNicknameAvailable(nickname.trim());
    setStatus(available ? 'available' : 'taken');
  };

  const handleSave = async () => {
    if (!nickname.trim() || nickname.trim().length < 2 || nickname.trim().length > 15) {
      toast.info('닉네임은 2~15자여야 합니다.');
      return;
    }
    if (nickname.trim() === currentNickname) {
      router.back();
      return;
    }
    if (status !== 'available') {
      toast.info('닉네임 중복 확인을 해주세요.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, nickname: nickname.trim() });

      if (error) {
        if (error.code === '23505') {
          toast.error('이미 사용 중인 닉네임입니다.');
          return;
        }
        throw error;
      }

      await supabase.auth.updateUser({ data: { name: nickname.trim() } });

      toast.success('닉네임이 변경되었습니다.');
      router.back();
    } catch (error: any) {
      toast.error('닉네임 변경에 실패했습니다.', error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    // 빈 영역 탭 시 키보드 닫기 (스크롤 없는 화면이라 컨테이너에서 처리)
    <Pressable
      onPress={Keyboard.dismiss}
      accessible={false}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.text }]}>닉네임</Text>

      <View style={styles.nicknameRow}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          placeholder="닉네임 (2~15자)"
          placeholderTextColor={colors.textSecondary}
          value={nickname}
          onChangeText={(text) => {
            setNickname(text);
            setStatus('idle');
          }}
          maxLength={15}
        />
        <TouchableOpacity
          onPress={handleRandom}
          style={[styles.randomButton, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.randomText, { color: colors.text }]}>랜덤</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCheck}
          style={[
            styles.checkButton,
            { backgroundColor: status === 'available' ? semantic.success : colors.tint },
          ]}>
          <Text style={[styles.checkText, { color: colors.background }]}>
            {status === 'checking' ? '...' : status === 'available' ? '✓' : '확인'}
          </Text>
        </TouchableOpacity>
      </View>

      {status === 'available' && (
        <Text style={styles.statusAvailable}>사용 가능한 닉네임입니다</Text>
      )}
      {status === 'taken' && (
        <Text style={styles.statusTaken}>이미 사용 중인 닉네임입니다</Text>
      )}

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
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  nicknameRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  randomButton: {
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  randomText: {
    fontSize: 13,
    fontWeight: '600',
  },
  checkButton: {
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusAvailable: {
    fontSize: 12,
    color: semantic.success,
    fontWeight: '600',
    marginTop: 6,
  },
  statusTaken: {
    fontSize: 12,
    color: semantic.danger,
    fontWeight: '600',
    marginTop: 6,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
