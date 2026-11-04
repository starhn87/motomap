import { createContext, useContext, useEffect, useState, type ComponentType } from 'react';
import { useIsFocused } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-screens/experimental';
import { SafeAreaInsetsContext, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import SettingsButton from './SettingsButton';
import { TabOcclusionContext } from './tabOcclusion';
import { HeaderInsetContext } from './headerInset';
import HeaderBackdrop from '@/components/ui/HeaderBackdrop';
import { HeaderScrollProvider } from './headerScroll';

type Options = { title?: string; settings?: boolean };
// NativeTabs가 만드는 tab-local provider 대신 기존 화면·전체화면 모달은 기기 가장자리의
// inset을 계속 받는다. 탭 가림 높이는 native probe로 실측해 조작부·목록에 전달한다.
export const NativeTabDeviceInsetsContext = createContext<EdgeInsets | null>(null);

function NativeTabFrame({ Screen, title, settings }: Options & { Screen: ComponentType }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const focused = useIsFocused();
  const [visited, setVisited] = useState(focused);
  const deviceInsets = useContext(NativeTabDeviceInsetsContext);
  // 프로바이더를 덮어쓰기 전에 읽는다. 붙은 탭은 시스템 탭 윗변까지의 inset을 준다.
  const tabLocalBottom = useSafeAreaInsets().bottom;
  const [probed, setProbed] = useState(0);
  const [headerHeight, setHeaderHeight] = useState((deviceInsets?.top ?? 0) + 44);
  const occlusion = Math.max(probed, tabLocalBottom);
  useEffect(() => { if (focused) setVisited(true); }, [focused]);

  // 네이티브 탭은 모든 화면을 먼저 만든다. 첫 방문까지 본체를 미루되 이후에는
  // 포커스를 잃어도 언마운트하지 않아 지도·폼·스크롤 상태를 그대로 보존한다.
  // 하단 inset은 화면 높이를 줄이지 않는다. 콘텐츠는 화면 끝까지 가고,
  // 버튼·시트만 occlusion으로 떠 있는 탭을 피한다.
  return (
    <SafeAreaInsetsContext.Provider value={deviceInsets}>
      <TabOcclusionContext.Provider value={occlusion}>
        <HeaderScrollProvider>
        <SafeAreaView collapsable={false}
          edges={{ top: false, bottom: false, left: true, right: true }}
          style={{ flex: 1, backgroundColor: colors.background }}>
          <SafeAreaView
            pointerEvents="none"
            collapsable={false}
            edges={{ top: false, bottom: true, left: false, right: false }}
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              setProbed((current) => (height > current ? height : current));
            }}
            style={styles.probe}
          />
          <View collapsable={false} style={styles.content}>
            <HeaderInsetContext.Provider value={title ? headerHeight : 0}>
              {(visited || focused) && <Screen />}
            </HeaderInsetContext.Provider>
          </View>
          {title && <View style={[styles.header, { paddingTop: deviceInsets?.top ?? 0 }]}
            onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
            <HeaderBackdrop />
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            {settings && <View style={[styles.right, { top: deviceInsets?.top ?? 0 }]}><SettingsButton /></View>}
          </View>}
        </SafeAreaView>
        </HeaderScrollProvider>
      </TabOcclusionContext.Provider>
    </SafeAreaInsetsContext.Provider>
  );
}

// URL·route params를 바꾸지 않고 iOS에만 헤더와 native safe area를 보완한다.
// 콘텐츠는 화면 끝까지 두고, 시트/FAB/목록만 실측된 탭 가림 높이를 피한다.
export function withNativeTabScreen(Screen: ComponentType, options: Options = {}) {
  return function TabScreen() {
    if (Platform.OS !== 'ios') return <Screen />;
    return <NativeTabFrame Screen={Screen} {...options} />;
  };
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  probe: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    overflow: 'visible',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginVertical: 10,
    marginHorizontal: 64,
  },
  right: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' },
});
