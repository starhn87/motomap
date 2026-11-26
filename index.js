import { requireOptionalNativeModule } from 'expo-modules-core';
import { AppRegistry, Platform } from 'react-native';

import { registerNaverMapFabricEvents } from './lib/naverMapFabricEvents';

// 지도 네이티브가 JS spec에 없는 렌더 이벤트를 보내면 Fabric이 앱을 종료한다.
// 화면이 마운트되기 전에 이름만 등록한다. 핸들러는 연결하지 않는다.
const viewConfigRegistry = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry');
registerNaverMapFabricEvents(viewConfigRegistry.customDirectEventTypes);

if (Platform.OS === 'android') {
  AppRegistry.registerComponent('MotoMapAndroidGuide', () => require('./components/navigation/AndroidGuidePanel').default);
} else if (Platform.OS === 'ios') {
  AppRegistry.registerComponent('MotoMapGuidePanel', () => require('./components/navigation/IOSGuidePanel').default);
  const guide = requireOptionalNativeModule('KakaoNavi');
  void guide?.enableIOSGuidePanel?.().catch(() => {});
}

require('expo-router/entry');
