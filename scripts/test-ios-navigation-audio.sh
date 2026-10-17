#!/bin/bash
# 정책과 실제 AVAudioSession 옵션을 검사한다. SDK 음성/다른 앱의 음향 감쇠 검사는 별도다.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d /tmp/motomap-audio-tests.XXXXXX)
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
app="$work/NavigationAudioTests.app"
mkdir -p "$app"
xcrun clang -fobjc-arc -fmodules -target "$arch-apple-ios16.4-simulator" -isysroot "$sdkroot" \
  -I "$root/modules/kakao-navi/ios" -framework UIKit -framework Foundation -framework AVFAudio \
  "$root/modules/kakao-navi/ios/KNNaviAudioFocus.m" \
  "$root/tests/ios/KNNaviAudioFocusTests.m" "$root/tests/ios/NavigationAudioTestApp.m" \
  -o "$app/NavigationAudioTests"
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.ridemap.tests.navigation-audio</string>
<key>CFBundleExecutable</key><string>NavigationAudioTests</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>16.4</string>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>UIApplicationSceneManifest</key><dict><key>UISceneConfigurations</key><dict>
<key>UIWindowSceneSessionRoleApplication</key><array><dict>
<key>UISceneConfigurationName</key><string>AudioTests</string>
<key>UISceneDelegateClassName</key><string>NavigationAudioTestScene</string>
</dict></array></dict></dict>
</dict></plist>
PLIST
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
simulator_id=$(xcrun simctl create 'MotoMap Audio Focus Tests' "$device_type" "$runtime")
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b >/dev/null
xcrun simctl install "$simulator_id" "$app"
xcrun simctl launch "$simulator_id" com.ridemap.tests.navigation-audio >/dev/null
container=$(xcrun simctl get_app_container "$simulator_id" com.ridemap.tests.navigation-audio data)
for ((i=0; i<150; i++)); do
  if [[ -f "$container/Documents/audio-policy-result.txt" ]]; then
    result=$(cat "$container/Documents/audio-policy-result.txt")
    printf '%s\n' "$result"
    [[ "$result" == *'failures=0 '* ]]
    exit $?
  fi
  sleep 0.2
done
echo '오디오 정책 테스트 결과를 받지 못했습니다.' >&2
exit 1
