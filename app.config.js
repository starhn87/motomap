export default {
  expo: {
    name: 'RideMap',
    slug: 'ridemap',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'ridemap',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0A0A0A',
    },
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          '라이딩 중 현재 위치를 표시하고 주변 장소를 찾기 위해 위치 정보가 필요합니다.',
      },
      bundleIdentifier: 'com.ridemap.app',
    },
    android: {
      package: 'com.ridemap.app',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      './plugins/withQuerySchemes',
      [
        '@mj-studio/react-native-naver-map',
        {
          client_id: process.env.NAVER_MAP_CLIENT_ID,
        },
      ],
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: process.env.KAKAO_NATIVE_APP_KEY,
          android: {
            authCodeHandlerActivity: false,
            forwardKakaoLinkIntentFilterToMainActivity: false,
            followChannelHandlerActivity: false,
          },
          ios: {
            handleKakaoOpenUrl: false,
            naviApplicationQuerySchemes: true,
          },
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: [
              'https://repository.map.naver.com/archive/maven',
            ],
          },
        },
      ],
    ],
    extra: {
      kakaoNativeAppKey: process.env.KAKAO_NATIVE_APP_KEY,
    },
    experiments: {
      typedRoutes: true,
    },
  },
};
