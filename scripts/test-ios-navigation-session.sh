#!/bin/bash
# 실제 presenter의 음성·도착 콜백 경계를 검사한다. 실제 GPS·SDK 경로 재시작 검증은 별도다.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d /tmp/motomap-session-tests.XXXXXX)
simulator_id=''
cleanup() {
  if [[ -n "$simulator_id" ]]; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
sdkroot=$(xcrun --sdk iphonesimulator --show-sdk-path)
arch=$(uname -m)
app="$work/NavigationSessionTests.app"
mkdir -p "$app"
products=${MOTOMAP_SIMULATOR_PRODUCTS:-$(python3 - <<'PYCODE'
from pathlib import Path
roots=list((Path.home()/'Library/Developer/Xcode/DerivedData').glob('app-*/Build/Products/Debug-iphonesimulator'))
roots=[p for p in roots if (p/'app.app/Frameworks/KNSDK.framework').exists()]
if not roots: raise SystemExit('기존 simulator framework 빌드가 필요합니다.')
print(max(roots,key=lambda p:p.stat().st_mtime))
PYCODE
)}
mkdir -p "$app/Frameworks"
for framework in KNSDK KMLocationSDK KakaoSDKCommon RNCryptor Realm RealmSwift Alamofire; do
  if [[ "$framework" == KNSDK ]]; then
    cp -R "$root/ios/Pods/KNSDK-UI/KNSDK.xcframework/ios-arm64_x86_64-simulator/KNSDK.framework" "$app/Frameworks/"
  elif [[ "$framework" == KMLocationSDK ]]; then
    cp -R "$root/ios/Pods/LocationCocoaPod/KMLocationSDK.xcframework/ios-arm64_x86_64-simulator/KMLocationSDK.framework" "$app/Frameworks/"
  else
    cp -R "$products/app.app/Frameworks/$framework.framework" "$app/Frameworks/"
  fi
  codesign --force --sign - "$app/Frameworks/$framework.framework" >/dev/null 2>&1
done
xcrun clang -fobjc-arc -fmodules -target "$arch-apple-ios16.4-simulator" -isysroot "$sdkroot" \
  -I "$root/modules/kakao-navi/ios" -F "$app/Frameworks" -framework KNSDK \
  -framework UIKit -framework Foundation -framework AVFoundation -framework CoreLocation \
  -Wl,-rpath,@executable_path/Frameworks \
  "$root/modules/kakao-navi/ios/KNNaviPresenter.m" \
  "$root/modules/kakao-navi/ios/KNNaviTheme.m" \
  "$root/modules/kakao-navi/ios/KNSDKBridge.m" \
  "$root/modules/kakao-navi/ios/KNNaviAudioFocus.m" \
  "$root/modules/kakao-navi/ios/KNNaviArrivalRecovery.m" \
  "$root/tests/ios/KNNaviSessionTests.m" "$root/tests/ios/NavigationSessionTestApp.m" \
  -o "$app/NavigationSessionTests"
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.ridemap.tests.navigation-session</string>
<key>CFBundleExecutable</key><string>NavigationSessionTests</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>16.4</string>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>UIApplicationSceneManifest</key><dict><key>UISceneConfigurations</key><dict>
<key>UIWindowSceneSessionRoleApplication</key><array><dict>
<key>UISceneConfigurationName</key><string>SessionTests</string>
<key>UISceneDelegateClassName</key><string>NavigationSessionTestScene</string>
</dict></array></dict></dict>
</dict></plist>
PLIST
mkdir -p "$app/MotoMapNavigationVoice.bundle"
cp "$root/modules/kakao-navi/ios/Resources/navigation-start.mp3" "$app/MotoMapNavigationVoice.bundle/"
codesign --force --sign - "$app" >/dev/null 2>&1
xcrun simctl list runtimes --json > "$work/runtimes.json"
xcrun simctl list devicetypes --json > "$work/types.json"
read -r runtime device_type < <(python3 - "$work" <<'PY'
import json,sys
from pathlib import Path
work=Path(sys.argv[1])
runtimes=[x for x in json.loads((work/'runtimes.json').read_text())['runtimes'] if x.get('isAvailable') and '.iOS-' in x['identifier']]
runtime=max(runtimes,key=lambda x:tuple(map(int,x['version'].split('.'))))
parts=list(map(int,runtime['version'].split('.')))+[0,0]
version=(parts[0]<<16)|(parts[1]<<8)|parts[2]
types=[x for x in json.loads((work/'types.json').read_text())['devicetypes']
       if x.get('productFamily')=='iPhone' and x.get('minRuntimeVersion',0)<=version<=x.get('maxRuntimeVersion',2**32-1)]
device=max(types,key=lambda x:x.get('minRuntimeVersion',0))
print(runtime['identifier'],device['identifier'])
PY
)
simulator_id=$(xcrun simctl create 'MotoMap Navigation Session Tests' "$device_type" "$runtime")
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b >/dev/null
xcrun simctl install "$simulator_id" "$app"
xcrun simctl launch "$simulator_id" com.ridemap.tests.navigation-session >/dev/null
container=$(xcrun simctl get_app_container "$simulator_id" com.ridemap.tests.navigation-session data)
for ((i=0; i<150; i++)); do
  if [[ -f "$container/Documents/session-result.txt" ]]; then
    result=$(cat "$container/Documents/session-result.txt")
    printf '%s\n' "$result"
    [[ "$result" == *'failures=0 '* ]]
    exit $?
  fi
  sleep 0.2
done
echo '길안내 세션 테스트 결과를 받지 못했습니다.' >&2
exit 1
