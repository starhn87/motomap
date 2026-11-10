import { AppRegistry, Platform } from 'react-native';

if (Platform.OS === 'android') {
  AppRegistry.registerComponent('MotoMapAndroidGuide', () => require('./components/navigation/AndroidGuidePanel').default);
}

require('expo-router/entry');
