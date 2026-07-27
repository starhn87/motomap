const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// KNSDK(카카오내비)는 Realm 을 동적 프레임워크(@rpath/Realm.framework)로 링크해 두었다.
// Expo/RN 기본값인 static library 로 두면 두 가지가 연달아 터진다.
//   1. pod install 실패 — "The Swift pod `RealmSwift` depends upon `Realm`, which does not define modules"
//   2. 넘겨도 실행 즉시 dyld 크래시 — "Library not loaded: @rpath/Realm.framework/Realm"
// prebuild 는 Podfile 을 새로 만들므로 매번 이 훅을 다시 넣어준다.
const ANCHOR = 'use_expo_modules!';
const HOOK = `
  # KNSDK 가 Realm 을 동적 프레임워크로 링크해 두어, static 으로 두면 dyld 가 실행 시점에 못 찾는다.
  pre_install do |installer|
    installer.pod_targets.each do |pod|
      next unless ['Realm', 'RealmSwift'].include?(pod.name)
      def pod.build_type = Pod::BuildType.dynamic_framework
    end
  end
`;

module.exports = function withRealmDynamicFramework(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes('Pod::BuildType.dynamic_framework')) return config;
      if (!contents.includes(ANCHOR)) {
        throw new Error(`withRealmDynamicFramework: Podfile 에서 "${ANCHOR}" 를 찾지 못했다`);
      }

      fs.writeFileSync(podfile, contents.replace(ANCHOR, `${ANCHOR}\n${HOOK}`));
      return config;
    },
  ]);
};
