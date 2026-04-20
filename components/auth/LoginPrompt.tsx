import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth';
import {
  generateRandomNickname,
  checkNicknameAvailable,
  createProfile,
} from '@/lib/nickname';

export default function LoginPrompt({ message }: { message?: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [isSignUp, setIsSignUp] = useState(false);

  // 회원가입 모드 진입 시 랜덤 닉네임 추천
  useEffect(() => {
    if (isSignUp && !nickname) {
      setNickname(generateRandomNickname());
    }
  }, [isSignUp]);

  const handleRandomNickname = () => {
    const newNick = generateRandomNickname();
    setNickname(newNick);
    setNicknameStatus('idle');
  };

  const handleCheckNickname = async () => {
    if (!nickname.trim()) {
      Alert.alert('알림', '닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length < 2 || nickname.trim().length > 15) {
      Alert.alert('알림', '닉네임은 2~15자여야 합니다.');
      return;
    }

    setNicknameStatus('checking');
    const available = await checkNicknameAvailable(nickname.trim());
    setNicknameStatus(available ? 'available' : 'taken');
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('알림', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (isSignUp) {
      if (!nickname.trim()) {
        Alert.alert('알림', '닉네임을 입력해주세요.');
        return;
      }
      if (nickname.trim().length < 2 || nickname.trim().length > 15) {
        Alert.alert('알림', '닉네임은 2~15자여야 합니다.');
        return;
      }
      if (nicknameStatus !== 'available') {
        Alert.alert('알림', '닉네임 중복 확인을 해주세요.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password, nickname.trim());
        await createProfile(nickname.trim());
        Alert.alert('가입 완료', '환영합니다!');
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (error: any) {
      Alert.alert('오류', error.message ?? '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colorScheme === 'dark' ? '#1A1A1A' : '#F9FAFB',
      color: colors.text,
      borderColor: colors.border,
    },
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(400)}
      style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {isSignUp ? '회원가입' : '로그인이 필요합니다'}
      </Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {message ?? '로그인하고 라이더 커뮤니티에 참여하세요.'}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.buttons}>
          {isSignUp && (
            <>
              <Text style={[styles.label, { color: colors.text }]}>닉네임 *</Text>
              <View style={styles.nicknameRow}>
                <TextInput
                  style={[...inputStyle, styles.nicknameInput]}
                  placeholder="닉네임 (2~15자)"
                  placeholderTextColor={colors.textSecondary}
                  value={nickname}
                  onChangeText={(text) => {
                    setNickname(text);
                    setNicknameStatus('idle');
                  }}
                  maxLength={15}
                />
                <TouchableOpacity
                  onPress={handleRandomNickname}
                  style={[styles.randomButton, { backgroundColor: colorScheme === 'dark' ? '#2A2A2A' : '#F3F4F6' }]}>
                  <Text style={[styles.randomText, { color: colors.text }]}>랜덤</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCheckNickname}
                  style={[
                    styles.checkButton,
                    {
                      backgroundColor:
                        nicknameStatus === 'available' ? '#22C55E' : colors.tint,
                    },
                  ]}>
                  <Text style={styles.checkText}>
                    {nicknameStatus === 'checking'
                      ? '...'
                      : nicknameStatus === 'available'
                        ? '✓'
                        : '확인'}
                  </Text>
                </TouchableOpacity>
              </View>
              {nicknameStatus === 'available' && (
                <Text style={styles.statusAvailable}>사용 가능한 닉네임입니다</Text>
              )}
              {nicknameStatus === 'taken' && (
                <Text style={styles.statusTaken}>이미 사용 중인 닉네임입니다</Text>
              )}
            </>
          )}

          <TextInput
            style={inputStyle}
            placeholder="이메일"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={inputStyle}
            placeholder="비밀번호"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable
            onPress={handleEmailAuth}
            style={({ pressed }) => [
              styles.emailButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}>
            <Text style={styles.emailButtonText}>
              {isSignUp ? '회원가입' : '이메일로 로그인'}
            </Text>
          </Pressable>

          <Pressable onPress={() => {
            setIsSignUp(!isSignUp);
            setNicknameStatus('idle');
          }}>
            <Text style={[styles.toggleText, { color: colors.tint }]}>
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    width: '100%',
    marginTop: 32,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  nicknameRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  nicknameInput: {
    flex: 1,
  },
  randomButton: {
    paddingHorizontal: 12,
    height: 44,
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
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  statusAvailable: {
    fontSize: 12,
    color: '#22C55E',
    fontWeight: '600',
    marginTop: -6,
  },
  statusTaken: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: -6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  emailButton: {
    backgroundColor: '#F97316',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
});
