import { requireOptionalNativeModule } from 'expo-modules-core';
import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'ios') {
  AppRegistry.registerComponent('MotoMapGuidePanel', () => require('./components/navigation/IOSGuidePanel').default);
  const guide = requireOptionalNativeModule('KakaoNavi');
  void guide?.enableIOSGuidePanel?.().catch(() => {});
}

require('expo-router/entry');
