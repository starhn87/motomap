const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { unstableBeforeAssetSerializationDebugIdPlugin } = require('posthog-react-native/metro');

// Sentry 설정의 getDefaultConfig로 PostHog 설정을 감싸면 둘 다 options.getDefaultConfig를
// 다시 호출해 재귀에 빠진다. 공식 debug id 플러그인을 Sentry 목록 앞에 둔다.
module.exports = getSentryExpoConfig(__dirname, {
  unstable_beforeAssetSerializationPlugins: [unstableBeforeAssetSerializationDebugIdPlugin],
});
