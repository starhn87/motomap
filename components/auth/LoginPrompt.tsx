import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useState, useEffect } from 'react';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth';
import {
  generateRandomNickname,
  checkNicknameAvailable,
  createProfile,
  updateAvatarUrl,
} from '@/lib/nickname';
import { pickImage, uploadImage } from '@/lib/uploadImage';
import { toast } from '@/lib/toast';

function AgreementRow({
  checked,
  onToggle,
  label,
  onView,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  onView: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={styles.agreementRow}>
      <Pressable onPress={onToggle} style={styles.agreementCheckArea}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: colors.border,
              backgroundColor: checked ? colors.tint : 'transparent',
            },
          ]}>
          {checked && <Text style={[styles.checkmark, { color: colors.background }]}>✓</Text>}
        </View>
        <Text style={[styles.agreementText, { color: colors.text }]}>{label}</Text>
      </Pressable>
      <Pressable onPress={onView}>
        <Text style={[styles.agreementView, { color: colors.textSecondary }]}>보기 ›</Text>
      </Pressable>
    </View>
  );
}

export default function LoginPrompt({ message }: { message?: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [agreedLocation, setAgreedLocation] = useState(false);

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
      toast.info('닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length < 2 || nickname.trim().length > 15) {
      toast.info('닉네임은 2~15자여야 합니다.');
      return;
    }

    setNicknameStatus('checking');
    const available = await checkNicknameAvailable(nickname.trim());
    setNicknameStatus(available ? 'available' : 'taken');
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      toast.info('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      toast.info('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (isSignUp) {
      if (!nickname.trim()) {
        toast.info('닉네임을 입력해주세요.');
        return;
      }
      if (nickname.trim().length < 2 || nickname.trim().length > 15) {
        toast.info('닉네임은 2~15자여야 합니다.');
        return;
      }
      if (nicknameStatus !== 'available') {
        toast.info('닉네임 중복 확인을 해주세요.');
        return;
      }
      if (!agreedTerms || !agreedPrivacy || !agreedLocation) {
        toast.info('모든 필수 약관에 동의해주세요.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email.trim(), password, nickname.trim());
        await createProfile(nickname.trim());
        if (avatarUri) {
          const url = await uploadImage(avatarUri, `avatars/${Date.now()}`);
          await updateAvatarUrl(url);
        }
        toast.success('환영합니다!');
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (error: any) {
      toast.error('로그인에 실패했습니다.', error.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.surface,
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
              <Pressable
                onPress={async () => {
                  const uri = await pickImage();
                  if (uri) setAvatarUri(uri);
                }}
                style={styles.avatarPicker}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarPlaceholderIcon}>📷</Text>
                    <Text style={[styles.avatarPlaceholderText, { color: colors.textSecondary }]}>
                      프로필 사진
                    </Text>
                  </View>
                )}
              </Pressable>

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
                  style={[styles.randomButton, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.randomText, { color: colors.text }]}>랜덤</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCheckNickname}
                  style={[
                    styles.checkButton,
                    {
                      backgroundColor:
                        nicknameStatus === 'available' ? semantic.success : colors.tint,
                    },
                  ]}>
                  <Text style={[styles.checkText, { color: colors.background }]}>
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

          {isSignUp && (
            <View style={styles.agreements}>
              <Pressable
                onPress={() => {
                  const all = !(agreedTerms && agreedPrivacy && agreedLocation);
                  setAgreedTerms(all); setAgreedPrivacy(all); setAgreedLocation(all);
                }}
                style={styles.agreementRow}>
                <View style={[
                  styles.checkbox,
                  { borderColor: colors.border, backgroundColor: (agreedTerms && agreedPrivacy && agreedLocation) ? colors.tint : 'transparent' },
                ]}>
                  {(agreedTerms && agreedPrivacy && agreedLocation) && (
                    <Text style={[styles.checkmark, { color: colors.background }]}>✓</Text>
                  )}
                </View>
                <Text style={[styles.agreementTextAll, { color: colors.text }]}>
                  모든 약관에 동의
                </Text>
              </Pressable>

              <View style={[styles.agreementDivider, { backgroundColor: colors.border }]} />

              <AgreementRow
                checked={agreedTerms}
                onToggle={() => setAgreedTerms((v) => !v)}
                label="서비스 이용약관 (필수)"
                onView={() => router.push('/legal/terms' as any)}
              />
              <AgreementRow
                checked={agreedPrivacy}
                onToggle={() => setAgreedPrivacy((v) => !v)}
                label="개인정보 처리방침 (필수)"
                onView={() => router.push('/legal/privacy' as any)}
              />
              <AgreementRow
                checked={agreedLocation}
                onToggle={() => setAgreedLocation((v) => !v)}
                label="위치기반 서비스 이용약관 (필수)"
                onView={() => router.push('/legal/location' as any)}
              />
            </View>
          )}

          <Pressable
            onPress={handleEmailAuth}
            style={({ pressed }) => [
              styles.emailButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Text style={[styles.emailButtonText, { color: colors.background }]}>
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
  avatarPicker: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  avatarPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderIcon: {
    fontSize: 24,
  },
  avatarPlaceholderText: {
    fontSize: 10,
    marginTop: 2,
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
    fontSize: 14,
    fontWeight: '700',
  },
  statusAvailable: {
    fontSize: 12,
    color: semantic.success,
    fontWeight: '600',
    marginTop: -6,
  },
  statusTaken: {
    fontSize: 12,
    color: semantic.danger,
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
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  toggleText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  agreements: {
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  agreementCheckArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
  },
  agreementText: {
    fontSize: 13,
    fontWeight: '500',
  },
  agreementTextAll: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  agreementView: {
    fontSize: 12,
    fontWeight: '500',
  },
  agreementDivider: {
    height: 1,
    marginVertical: 2,
  },
});
