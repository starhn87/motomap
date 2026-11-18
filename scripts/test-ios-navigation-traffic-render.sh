#!/bin/bash
# 실제 SDK의 고정 공개 경로로 GPS 대기 중 교통 막대 표시를 검증한다. 별도 시뮬레이터만 사용한다.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
umask 077
: "${KAKAO_NATIVE_APP_KEY:?Load project env}"
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
products=${MOTOMAP_SIMULATOR_PRODUCTS:-$(/usr/bin/python3 - <<'PYCODE'
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
  "$root/modules/kakao-navi/ios/KNNaviArrivalPrompt.m" \
  "$root/modules/kakao-navi/ios/KNNaviRouteView.m" \
  "$root/modules/kakao-navi/ios/KNNaviBottomPanel.m" \
  "$root/modules/kakao-navi/ios/KNNaviHiddenViews.m" \
  "$root/modules/kakao-navi/ios/KNNaviHazardSheet.m" \
  "$root/modules/kakao-navi/ios/KNNaviGasLayer.m" \
  "$root/modules/kakao-navi/ios/KNNaviTrafficBar.m" \
  "$root/tests/ios/KNNaviTrafficRenderTestApp.m" \
  -o "$app/NavigationSessionTests"
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.ridemap.app</string>
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
<key>UISceneDelegateClassName</key><string>ProbeScene</string>
</dict></array></dict></dict>
</dict></plist>
PLIST
mkdir -p "$app/MotoMapNavigationVoice.bundle"
cp "$root/modules/kakao-navi/ios/Resources/navigation-start.mp3" "$app/MotoMapNavigationVoice.bundle/"
mkdir -p "$app/MotoMapNavigationUI.bundle"
cp "$root"/modules/kakao-navi/ios/Resources/GasBrands/*.png "$app/MotoMapNavigationUI.bundle/"
/usr/bin/python3 - "$app" <<'CONFIG'
import plistlib,os,sys
from pathlib import Path
p=Path(sys.argv[1]);(p/'ProbeConfig.plist').write_bytes(plistlib.dumps({'key':os.environ['KAKAO_NATIVE_APP_KEY']}))
i=plistlib.loads((p/'Info.plist').read_bytes());i['NSLocationWhenInUseUsageDescription']='Isolated route probe';i['NSLocationAlwaysAndWhenInUseUsageDescription']='Isolated route probe';i['UIBackgroundModes']=['location'];(p/'Info.plist').write_bytes(plistlib.dumps(i))
CONFIG
codesign --force --sign - "$app" >/dev/null 2>&1
xcrun simctl list runtimes --json > "$work/runtimes.json"
xcrun simctl list devicetypes --json > "$work/types.json"
read -r runtime device_type < <(/usr/bin/python3 - "$work" <<'PY'
import json,sys
from pathlib import Path
work=Path(sys.argv[1])
runtimes=[x for x in json.loads((work/'runtimes.json').read_text())['runtimes'] if x.get('isAvailable') and '.iOS-' in x['identifier']]
runtime=max(runtimes,key=lambda x:tuple(map(int,x['version'].split('.'))))
parts=list(map(int,runtime['version'].split('.')))+[0,0]
version=(parts[0]<<16)|(parts[1]<<8)|parts[2]
types=[x for x in json.loads((work/'types.json').read_text())['devicetypes']
       if x.get('productFamily')=='iPhone' and x.get('minRuntimeVersion',0)<=version<=x.get('maxRuntimeVersion',2**32-1)]
device=next(x for x in types if x['identifier']=='com.apple.CoreSimulator.SimDeviceType.iPhone-16')
print(runtime['identifier'],device['identifier'])
PY
)
simulator_id=$(xcrun simctl create 'MotoMap Navigation Session Tests' "$device_type" "$runtime")
xcrun simctl boot "$simulator_id"
xcrun simctl bootstatus "$simulator_id" -b >/dev/null
xcrun simctl install "$simulator_id" "$app"
xcrun simctl privacy "$simulator_id" grant location com.ridemap.app
xcrun simctl location "$simulator_id" set 37.4977,127.0276
xcrun simctl launch "$simulator_id" com.ridemap.app >/dev/null
container=$(xcrun simctl get_app_container "$simulator_id" com.ridemap.app data)
for ((i=0;i<450;i++)); do
 if [[ -f "$container/Documents/traffic-result.json" ]]; then
  cp "$container/Documents/traffic-result.json" /tmp/motomap-traffic-render-result.json
  if [[ -f "$container/Documents/traffic-live.png" ]]; then cp "$container/Documents/traffic-live.png" /tmp/motomap-traffic-render.png; fi
  cat /tmp/motomap-traffic-render-result.json
  /usr/bin/python3 -c 'import json,sys;visible=json.load(open(sys.argv[1]))["result"]=="VISIBLE";print("TRAFFIC_RENDER_RESULT visible="+str(int(visible)));sys.exit(0 if visible else 1)' /tmp/motomap-traffic-render-result.json
  exit $?
 fi
 sleep 0.2
done
echo TRAFFIC_PROBE_TIMEOUT
exit 1
