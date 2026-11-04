import { requireOptionalNativeModule } from 'expo';
import { Platform, UIManager } from 'react-native';

// Expo UI가 전이 의존성으로 들어 있던 옛 빌드도 구분한다. 확인 전 JS 모듈을 평가하지 않는다.
const contract = Platform.OS === 'ios' ? requireOptionalNativeModule<{
  bridgeVersion?: number;
  features?: string[];
}>('KakaoNavi') : null;
const supported = (contract?.bridgeVersion ?? 0) >= 40 && contract?.features?.includes('native_ui_controls');
const expoUIModule = supported ? requireOptionalNativeModule('ExpoUI') : null;

export const nativeUI: {
  views: typeof import('@expo/ui/swift-ui');
  modifiers: typeof import('@expo/ui/swift-ui/modifiers');
} | null = expoUIModule ? {
  views: require('@expo/ui/swift-ui'),
  modifiers: require('@expo/ui/swift-ui/modifiers'),
} : null;

// UIKit 세그먼트는 실제 높이·서체를 지원하는 새 바이너리에서만 평가한다.
export const NativeSegmentedControl: typeof import('@react-native-segmented-control/segmented-control').default | null =
  supported && (contract?.bridgeVersion ?? 0) >= 41 && contract?.features?.includes('native_segmented_controls')
    && UIManager.getViewManagerConfig('RNCSegmentedControl')
    ? require('@react-native-segmented-control/segmented-control').default : null;
