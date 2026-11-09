import { memo, startTransition, useCallback, useMemo, useState, type ComponentType } from 'react';
import { useIsFocused } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

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
const SECTIONS: { key: Section; label: string; Content: ComponentType<{ active: boolean }> }[] = [
  { key: 'submissions', label: '내 제보', Content: memo(MySubmissionsList) },
  { key: 'reviews', label: '리뷰', Content: memo(MyReviewsList) },
  { key: 'notifications', label: '알림', Content: memo(NotificationsList) },
];
const SECTION_WIDTH = 100 / SECTIONS.length;

function SectionLabel({ index, label, progress, color, activeColor }: {
  index: number; label: string; progress: SharedValue<number>; color: string; activeColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(1 - Math.min(1, Math.abs(progress.value - index)), [0, 1], [color, activeColor]),
  }));
  return <Animated.Text style={[styles.label, animatedStyle]}>{label}</Animated.Text>;
}

function ActivityContent() {
  const headerInset = useContentHeaderInset();
  const colors = Colors[useColorScheme() ?? 'light'];
  const focused = useIsFocused();
  const unread = useUnreadCount();
  const [section, setSection] = useState<Section>('submissions');
  const [renderedSection, setRenderedSection] = useState<Section>('submissions');
  const [visited, setVisited] = useState<Section[]>(['submissions']);
  const [sectionHeight, setSectionHeight] = useState(nativeUI ? 48 : 44);
  const progress = useSharedValue(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    left: `${progress.value * SECTION_WIDTH}%`,
  }));
  const options = useMemo(() => SECTIONS.map(item => ({
    value: item.key,
    label: item.label + (item.key === 'notifications' && unread > 0 ? ` ${unread > 9 ? '9+' : unread}` : ''),
    accessibilityLabel: item.key === 'notifications' && unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : item.label,
  })), [unread]);
  const selectSection = useCallback((key: Section) => {
    if (!nativeUI) progress.value = withTiming(SECTIONS.findIndex(item => item.key === key), { duration: 210 });
    setSection(key);
    // 이미 방문한 목록도 네이티브 선택 표시보다 먼저 갱신하지 않는다.
    startTransition(() => {
      setVisited(current => current.includes(key) ? current : [...current, key]);
      setRenderedSection(key);
    });
  }, [progress]);
  const selectedListReady = renderedSection === section;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    {!selectedListReady && !visited.includes(section) && <HeaderInsetContext.Provider value={headerInset + sectionHeight}>
      {section === 'reviews' ? <ReviewSkeletonList /> : section === 'notifications' ? <NotificationSkeletonList /> : <SubmissionSkeletonList />}
    </HeaderInsetContext.Provider>}
    {SECTIONS.filter(item => visited.includes(item.key)).map(({ key, Content }) => {
      const visible = renderedSection === key && (selectedListReady || visited.includes(section));
      return <View key={key} style={[styles.list, !visible && styles.hiddenList]}
        pointerEvents={selectedListReady && visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!selectedListReady || !visible}
        importantForAccessibility={selectedListReady && visible ? 'auto' : 'no-hide-descendants'}>
        <HeaderInsetContext.Provider value={headerInset + sectionHeight}>
          <Content active={focused && key === section && selectedListReady} />
        </HeaderInsetContext.Provider>
      </View>;
    })}
    <View accessibilityRole="tablist" style={[styles.sections, { top: headerInset }]}
      onLayout={event => setSectionHeight(event.nativeEvent.layout.height)}>
      <HeaderBackdrop />
      {nativeUI ? <View style={styles.nativeSections}>
        <NativeChoiceControl label="활동 종류" presentation="segmented" value={section} onChange={selectSection}
          enabled={focused} options={options} />
      </View> : <>
        {options.map(({ value, label, accessibilityLabel }, index) => <Pressable key={value} accessibilityRole="tab"
          accessibilityState={{ selected: section === value }} accessibilityLabel={accessibilityLabel}
          onPress={() => selectSection(value)}
          style={({ pressed }) => [styles.section, { opacity: pressed ? 0.7 : 1 }]}>
          <SectionLabel index={index} label={label} progress={progress} color={colors.textSecondary} activeColor={colors.text} />
        </Pressable>)}
        <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.text }, indicatorStyle]} />
      </>}
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
  list: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  hiddenList: { opacity: 0 },
  section: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingBottom: 2 },
  indicator: { position: 'absolute', bottom: 0, height: 2, width: `${SECTION_WIDTH}%` },
  nativeSections: { flex: 1, paddingHorizontal: 16, paddingBottom: 4 },
  label: { fontSize: 15, fontWeight: '600' },
});
