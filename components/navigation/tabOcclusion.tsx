import { createContext, useContext } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// JS 탭(Android·웹)만 이 숫자로 띄운다. iOS 시스템 탭 높이는 추정하지 않고
// NativeTabScreen의 실측값을 TabOcclusionContext로 넘긴다.
export const FLOATING_TAB_BAR_HEIGHT = 56;
export const FLOATING_TAB_LIFT = 10;
export const ANDROID_TAB_BAR_HEIGHT = 58;
export const ANDROID_TAB_LIFT = 8;
export const ANDROID_TAB_SIDE_INSET = 20;

/** 화면 맨 아래에서 떠 있는 JS 탭의 윗변까지. */
export function jsTabTopFromBottom(deviceBottomInset: number, android = false) {
  const barHeight = android ? ANDROID_TAB_BAR_HEIGHT : FLOATING_TAB_BAR_HEIGHT;
  const lift = android ? ANDROID_TAB_LIFT : FLOATING_TAB_LIFT;
  return deviceBottomInset + lift + barHeight;
}

export const TabOcclusionContext = createContext(0);

export function useTabOcclusion(active = true) {
  const measured = useContext(TabOcclusionContext);
  if (!active) return 0;
  return measured;
}

/** 스크롤 맨 끝이 떠 있는 탭에 가리지 않게 비우는 자리. */
export function TabScrollSpacer() {
  const occlusion = useTabOcclusion();
  if (occlusion <= 0) return null;
  return <View style={{ height: occlusion }} />;
}

/** Android·웹 탭 레이아웃이 자식에게 넘길 가림 높이. */
export function useJsTabOcclusion() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? 0 : jsTabTopFromBottom(insets.bottom, Platform.OS === 'android');
}
