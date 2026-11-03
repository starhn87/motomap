import { useState } from 'react';
import { useIsFocused } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUnreadCount } from '@/hooks/useNotifications';
import LoginPrompt from '@/components/auth/LoginPrompt';
import MySubmissionsList from './MySubmissionsList';
import MyReviewsList from './MyReviewsList';
import NotificationsList from './NotificationsList';

type Section = 'submissions' | 'reviews' | 'notifications';
const SECTIONS: { key: Section; label: string; Content: typeof MyReviewsList }[] = [
  { key: 'submissions', label: '내 제보', Content: MySubmissionsList },
  { key: 'reviews', label: '리뷰', Content: MyReviewsList },
  { key: 'notifications', label: '알림', Content: NotificationsList },
];

function ActivityContent() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const focused = useIsFocused();
  const unread = useUnreadCount();
  const [section, setSection] = useState<Section>('submissions');
  const [visited, setVisited] = useState<Section[]>(['submissions']);
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View accessibilityRole="tablist" style={[styles.sections, { borderBottomColor: colors.border }]}>
      {SECTIONS.map(item => <Pressable key={item.key} accessibilityRole="tab"
        accessibilityState={{ selected: section === item.key }}
        accessibilityLabel={item.key === 'notifications' && unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : item.label}
        onPress={() => {
          setSection(item.key);
          setVisited(current => current.includes(item.key) ? current : [...current, item.key]);
        }}
        style={({ pressed }) => [styles.section, { borderBottomColor: section === item.key ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.label, { color: section === item.key ? colors.text : colors.textSecondary }]}>
          {item.label}{item.key === 'notifications' && unread > 0 ? ` ${unread > 9 ? '9+' : unread}` : ''}
        </Text>
      </Pressable>)}
    </View>
    {SECTIONS.filter(item => visited.includes(item.key)).map(({ key, Content }) => (
      <View key={key} style={{ flex: 1, display: section === key ? 'flex' : 'none' }}
        accessibilityElementsHidden={section !== key} importantForAccessibility={section === key ? 'auto' : 'no-hide-descendants'}>
        <Content active={focused && section === key} />
      </View>
    ))}
  </View>;
}

export default function ActivityScreen() {
  const user = useAuthStore(state => state.user);
  if (!user) return <LoginPrompt message="로그인하고 내 제보와 리뷰, 알림을 확인하세요." />;
  // 계정 전환 때 숨긴 목록의 스크롤·알림 읽음 스냅샷까지 함께 비운다.
  return <ActivityContent key={user.id} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sections: { flexDirection: 'row', gap: 24, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 2 },
  label: { fontSize: 15, fontWeight: '600' },
});
