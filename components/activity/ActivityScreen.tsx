import { startTransition, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { HeaderInsetContext, useContentHeaderInset } from '@/components/navigation/headerInset';
import HeaderBackdrop from '@/components/ui/HeaderBackdrop';
import { useUnreadCount } from '@/hooks/useNotifications';
import LoginPrompt from '@/components/auth/LoginPrompt';
import MySubmissionsList, { SubmissionSkeletonList } from './MySubmissionsList';
import MyReviewsList, { ReviewSkeletonList } from './MyReviewsList';
import NotificationsList, { NotificationSkeletonList } from './NotificationsList';
import { nativeUI } from '@/lib/nativeUI';
import NativeChoiceControl from '@/components/ui/NativeChoiceControl';

type Section = 'submissions' | 'reviews' | 'notifications';
const SECTIONS: { key: Section; label: string; Content: typeof MyReviewsList }[] = [
  { key: 'submissions', label: '내 제보', Content: MySubmissionsList },
  { key: 'reviews', label: '리뷰', Content: MyReviewsList },
  { key: 'notifications', label: '알림', Content: NotificationsList },
];

function ActivityContent() {
  const headerInset = useContentHeaderInset();
  const colors = Colors[useColorScheme() ?? 'light'];
  const focused = useIsFocused();
  const unread = useUnreadCount();
  const [section, setSection] = useState<Section>('submissions');
  const [visited, setVisited] = useState<Section[]>(['submissions']);
  const [sectionHeight, setSectionHeight] = useState(nativeUI ? 48 : 44);
  const selectSection = (key: Section) => {
    setSection(key);
    startTransition(() => setVisited(current => current.includes(key) ? current : [...current, key]));
  };
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    {!visited.includes(section) && <HeaderInsetContext.Provider value={headerInset + sectionHeight}>
      {section === 'reviews' ? <ReviewSkeletonList /> : section === 'notifications' ? <NotificationSkeletonList /> : <SubmissionSkeletonList />}
    </HeaderInsetContext.Provider>}
    {SECTIONS.filter(item => visited.includes(item.key)).map(({ key, Content }) => (
      <View key={key} style={{ flex: 1, display: section === key ? 'flex' : 'none' }}
        accessibilityElementsHidden={section !== key} importantForAccessibility={section === key ? 'auto' : 'no-hide-descendants'}>
        <HeaderInsetContext.Provider value={headerInset + sectionHeight}>
          <Content active={focused && section === key} />
        </HeaderInsetContext.Provider>
      </View>
    ))}
    <View accessibilityRole="tablist" style={[styles.sections, { top: headerInset }]}
      onLayout={event => setSectionHeight(event.nativeEvent.layout.height)}>
      <HeaderBackdrop />
      {nativeUI ? <View style={styles.nativeSections}>
        <NativeChoiceControl label="활동 종류" presentation="segmented" value={section} onChange={selectSection} enabled={focused}
          options={SECTIONS.map(item => ({ value: item.key,
            label: item.label + (item.key === 'notifications' && unread > 0 ? ` ${unread > 9 ? '9+' : unread}` : ''),
            accessibilityLabel: item.key === 'notifications' && unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : item.label }))} />
      </View> : SECTIONS.map(item => <Pressable key={item.key} accessibilityRole="tab"
        accessibilityState={{ selected: section === item.key }}
        accessibilityLabel={item.key === 'notifications' && unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : item.label}
        onPress={() => selectSection(item.key)}
        style={({ pressed }) => [styles.section, { borderBottomColor: section === item.key ? colors.text : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.label, { color: section === item.key ? colors.text : colors.textSecondary }]}>
          {item.label}{item.key === 'notifications' && unread > 0 ? ` ${unread > 9 ? '9+' : unread}` : ''}
        </Text>
      </Pressable>)}
    </View>
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
  sections: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', zIndex: 5, overflow: 'hidden' },
  section: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
  nativeSections: { flex: 1, paddingHorizontal: 16, paddingBottom: 4 },
  label: { fontSize: 15, fontWeight: '600' },
});
