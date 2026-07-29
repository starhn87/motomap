export default {
  expo: {
    name: '모토맵',
    slug: 'ridemap',
    // 1.2.1: 안내 종료 후 백그라운드 GPS 해제(배터리) + 시작 멘트 생략 —
    // 네이티브 수정이라 runtime 분리로 1.2.0 이하 빌드가 새 OTA 를 받지 않게 한다
    version: '1.2.1',
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
        // KNSDK(카카오내비)는 초기화 시 백그라운드 위치 업데이트를 켠다.
        // 이 항목이 없으면 CoreLocation 이 즉시 예외를 던지며 앱이 죽는다
        // ("Invalid parameter not satisfying: !stayUp || CLClientIsBackgroundable").
        UIBackgroundModes: ['location'],
        NSLocationAlwaysAndWhenInUseUsageDescription:
          '길안내 중 화면이 꺼져 있어도 경로를 안내하기 위해 위치 정보가 필요합니다.',
        // KNSDK 의 위치 모듈(KMLocationSDK)이 CoreMotion 을 참조한다 — 실사용
        // 여부와 무관하게 문구가 없으면 ITMS-90683 으로 업로드가 거절된다(실측).
        NSMotionUsageDescription:
          '주행·정지 상태를 감지해 길안내 중 위치 정확도를 높이기 위해 동작 정보를 사용합니다.',
        // KNSDK 요구사항. 지도 타일 등 일부 리소스가 평문으로 오기 때문에
        // 이 예외가 없으면 경로는 받아와도 화면이 비어 있다.
        NSAppTransportSecurity: {
          NSExceptionDomains: {
            'kakao.com': {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSExceptionRequiresForwardSecrecy: false,
              NSIncludesSubdomains: true,
              NSTemporaryExceptionMinimumTLSVersion: 'TLSv1.0',
            },
          },
        },
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
      './plugins/withKNSDKDynamicFrameworks',
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
        'expo-notifications',
        {
          color: '#22C55E',
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
