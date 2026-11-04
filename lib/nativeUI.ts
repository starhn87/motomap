import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

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
