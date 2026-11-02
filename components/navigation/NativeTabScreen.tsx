import { createContext, useContext, useEffect, useState, type ComponentType } from 'react';
import { useIsFocused } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import NotificationBell from './NotificationBell';

type Options = { title?: string; notifications?: boolean };
// NativeTabs가 만드는 tab-local provider 대신 기존 화면·전체화면 모달은 기기 가장자리의
// inset을 계속 받는다. 실제 탭 회피는 아래 native SafeAreaView가 따로 담당한다.
export const NativeTabDeviceInsetsContext = createContext<EdgeInsets | null>(null);

function NativeTabFrame({ Screen, title, notifications }: Options & { Screen: ComponentType }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const focused = useIsFocused();
  const [visited, setVisited] = useState(focused);
  const deviceInsets = useContext(NativeTabDeviceInsetsContext);
  useEffect(() => { if (focused) setVisited(true); }, [focused]);

  // 네이티브 탭은 모든 화면을 먼저 만든다. 첫 방문까지 본체를 미루되 이후에는
  // 포커스를 잃어도 언마운트하지 않아 지도·폼·스크롤 상태를 그대로 보존한다.
  return (
    <SafeAreaInsetsContext.Provider value={deviceInsets}>
      <SafeAreaView collapsable={false}
        edges={{ top: !!title, bottom: true, left: true, right: true }}
        style={{ flex: 1, backgroundColor: colors.background }}>
        {title && <View style={[styles.header, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.border }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          {notifications && <View style={styles.right}><NotificationBell /></View>}
        </View>}
        <View collapsable={false} style={styles.content}>
          {(visited || focused) && <Screen />}
        </View>
      </SafeAreaView>
    </SafeAreaInsetsContext.Provider>
  );
}

// URL·route params를 바꾸지 않고 iOS에만 헤더와 native safe area를 보완한다.
// 실제 지도를 탭보다 위에 배치해 시트/FAB/선택 핀의 가시 영역을 일치시킨다.
export function withNativeTabScreen(Screen: ComponentType, options: Options = {}) {
  return function TabScreen() {
    if (Platform.OS !== 'ios') return <Screen />;
    return <NativeTabFrame Screen={Screen} {...options} />;
  };
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  header: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 24, marginVertical: 12, marginHorizontal: 60 },
  right: { position: 'absolute', right: 0 },
});
