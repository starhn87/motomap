export default {
  expo: {
    name: '모토맵',
    slug: 'ridemap',
    // 1.2.6: 소셜 로그인·보안 저장소·햅틱 설정·공유 카드처럼 네이티브
    // 모듈이 필요한 기능을 한 번의 심사 빌드로 묶는다.
    version: '1.2.6',
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
      usesAppleSignIn: true,
      associatedDomains: ['applinks:motomap.kr'],
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
      'expo-secure-store',
      'expo-apple-authentication',
      [
        'expo-web-browser',
        {
          experimentalLauncherActivity: false,
        },
      ],
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
        'expo-speech-recognition',
        {
          microphonePermission:
            '장갑을 낀 채로도 검색할 수 있도록 음성 검색에 마이크를 사용합니다.',
          speechRecognitionPermission:
            '말한 내용을 검색어로 바꾸기 위해 음성 인식을 사용합니다.',
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
            authCodeHandlerActivity: true,
            forwardKakaoLinkIntentFilterToMainActivity: false,
            followChannelHandlerActivity: false,
          },
          ios: {
            handleKakaoOpenUrl: true,
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
