export default {
  expo: {
    name: '모토맵',
    slug: 'ridemap',
    version: '1.1.1',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/46277971-d460-4e19-82eb-df05f18ff9f7',
    },
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
      supportsTablet: false,
      infoPlist: {
        CFBundleDevelopmentRegion: 'ko',
        CFBundleLocalizations: ['ko'],
        NSLocationWhenInUseUsageDescription:
          '라이딩 중 현재 위치를 표시하고 주변 장소를 찾기 위해 위치 정보가 필요합니다.',
        NSPhotoLibraryUsageDescription:
          '리뷰에 사진을 첨부하기 위해 사진 라이브러리 접근 권한이 필요합니다.',
        ITSAppUsesNonExemptEncryption: false,
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
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
      ],
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
        'expo-image-picker',
        {
          photosPermission: '리뷰에 사진을 첨부하기 위해 사진 라이브러리 접근 권한이 필요합니다.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            '라이딩 중 현재 위치를 표시하고 주변 장소를 찾기 위해 위치 정보가 필요합니다.',
        },
      ],
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
              // 카카오 SDK(com.kakao.sdk:*)는 Maven Central 이 아니라 카카오 전용
              // 저장소에만 있다. @react-native-kakao 는 mavenCentral 만 선언하므로 필수.
              'https://devrepo.kakao.com/nexus/content/groups/public/',
            ],
          },
        },
      ],
      [
        '@sentry/react-native',
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
    ],
    extra: {
      kakaoNativeAppKey: process.env.KAKAO_NATIVE_APP_KEY,
      eas: {
        projectId: '46277971-d460-4e19-82eb-df05f18ff9f7',
      },
    },
    owner: 'ridemapper',
    experiments: {
      typedRoutes: true,
    },
  },
};
