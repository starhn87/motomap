const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// KNSDK(카카오내비) 바이너리는 일부 의존성을 동적 프레임워크(@rpath/*.framework)로
// 링크해 두었다. Expo/RN 기본값인 static library 로 두면 두 가지가 연달아 터진다.
//   1. pod install 실패 — "Swift pod ... depends upon `Realm`, which does not define modules"
//   2. 넘겨도 실행 즉시 dyld 크래시 — "Library not loaded: @rpath/....framework"
// 목록은 KNSDK 바이너리에 otool -L 로 확인한다 (1.12.14 기준:
// Realm · RealmSwift · KakaoSDKCommon · RNCryptor, 그리고 KakaoSDKCommon 의존성
// Alamofire. KMLocationSDK 는 원래 동적 배포). 정적 의존이 섞이면 CocoaPods 가
// "transitive dependencies that include statically linked binaries" 로 막는다.
// prebuild 는 Podfile 을 새로 만들므로 매번 이 훅을 다시 넣어준다.
const ANCHOR = 'use_expo_modules!';
const HOOK = `
  # KNSDK 가 동적 프레임워크로 링크해 둔 의존성들 — static 이면 dyld 가 실행 시점에 못 찾는다.
  pre_install do |installer|
    installer.pod_targets.each do |pod|
      next unless ['Realm', 'RealmSwift', 'KakaoSDKCommon', 'RNCryptor', 'Alamofire'].include?(pod.name)
      pod.instance_variable_set(:@build_type, Pod::BuildType.dynamic_framework)
      def pod.build_type = Pod::BuildType.dynamic_framework
    end
  end
`;

module.exports = function withKNSDKDynamicFrameworks(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes('Pod::BuildType.dynamic_framework')) return config;
      if (!contents.includes(ANCHOR)) {
        throw new Error(`withKNSDKDynamicFrameworks: Podfile 에서 "${ANCHOR}" 를 찾지 못했다`);
      }

      fs.writeFileSync(podfile, contents.replace(ANCHOR, `${ANCHOR}\n${HOOK}`));
      return config;
    },
  ]);
};
