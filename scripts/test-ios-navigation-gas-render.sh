#!/bin/bash
# 실제 KNSDK 안내 지도에 가격 이미지가 그려지는지 확인한다. 공개 고정 경로·격리 시뮬레이터만 사용한다.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
: "${KAKAO_NATIVE_APP_KEY:?프로젝트 .env를 먼저 셸에 주입하세요.}"
python3 -c "from PIL import Image" # 화면 픽셀 판정용 Pillow(개발 도구)
work=$(mktemp -d /tmp/motomap-session-tests.XXXXXX)
simulator_id=''
cleanup() {
  if [[ -n "$simulator_id" ]]; then
    xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$simulator_id" >/dev/null 2>&1 || true
  fi
  python3 - "$work" <<'CLEANUP'
from pathlib import Path
import shutil,sys
p=Path(sys.argv[1]);assert p.name.startswith('motomap-session-tests.') and p.is_dir() and not p.is_symlink();shutil.rmtree(p)
CLEANUP
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
  -framework WebKit -framework UIKit -framework Foundation -framework AVFoundation -framework CoreLocation \
  -Wl,-rpath,@executable_path/Frameworks \
  "$root/modules/kakao-navi/ios/KNNaviPresenter.m" \
  "$root/modules/kakao-navi/ios/KNNaviTheme.m" \
  "$root/modules/kakao-navi/ios/KNSDKBridge.m" \
  "$root/modules/kakao-navi/ios/KNNaviAudioFocus.m" \
  "$root/modules/kakao-navi/ios/KNNaviArrivalRecovery.m" \
  "$root/modules/kakao-navi/ios/KNNaviRouteView.m" \
  "$root/modules/kakao-navi/ios/KNNaviBottomPanel.m" \
  "$root/modules/kakao-navi/ios/KNNaviHiddenViews.m" \
  "$root/modules/kakao-navi/ios/KNNaviHazardSheet.m" \
  "$root/modules/kakao-navi/ios/KNNaviGasLayer.m" \
  "$root/tests/ios/KNNaviGasRenderTestApp.m" \
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
cp "$root/modules/kakao-navi/ios/Resources/navigation-bottom.html" "$app/MotoMapNavigationUI.bundle/"
python3 - "$app" <<'CONFIG'
import plistlib,os,sys
from pathlib import Path
p=Path(sys.argv[1]);(p/'ProbeConfig.plist').write_bytes(plistlib.dumps({'key':os.environ['KAKAO_NATIVE_APP_KEY']}))
info=plistlib.loads((p/'Info.plist').read_bytes());info['NSLocationWhenInUseUsageDescription']='격리 시뮬레이터 지도 테스트';(p/'Info.plist').write_bytes(plistlib.dumps(info))
CONFIG
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
xcrun simctl privacy "$simulator_id" grant location com.ridemap.app
xcrun simctl launch "$simulator_id" com.ridemap.app >/dev/null
container=$(xcrun simctl get_app_container "$simulator_id" com.ridemap.app data)
for ((i=0; i<600; i++)); do
 if [[ -f "$container/Documents/probe-stage.json" ]]; then
  stage=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["stage"])' "$container/Documents/probe-stage.json")
  if [[ "$stage" == "PRODUCT" && ! -f "$work/product.png" ]]; then
   cp "$container/Documents/probe-stage.json" "$work/product-stage.json"
   xcrun simctl io "$simulator_id" screenshot "$work/product.png" >/dev/null 2>&1
   cat "$work/product-stage.json"
   touch "$container/Documents/render-control.flag"
  elif [[ "$stage" == "CONTROL" ]]; then
   xcrun simctl io "$simulator_id" screenshot "$work/control.png" >/dev/null 2>&1
   cat "$container/Documents/probe-stage.json"
   python3 - "$work" <<'PIXELS'
from pathlib import Path
from PIL import Image
import sys,json
root=Path(sys.argv[1])
def magenta(path):
 with Image.open(path) as im:
  return sum(r>230 and g<25 and b>230 for r,g,b in im.convert('RGB').getdata())
stage=json.loads((root/'product-stage.json').read_text())
assert stage['stage']=='PRODUCT', 'product capture handshake failed'
zoom=stage['zoom']
if not 0.1<=zoom<10:raise SystemExit('FAIL setup must exercise the hidden zoom range below 10')
product=magenta(root/'product.png');control=magenta(root/'control.png')
print(json.dumps({'zoom':zoom,'productPixels':product,'controlPixels':control,'rendered':product>1000 and control>1000}))
if product<=1000 or control<=1000:raise SystemExit('FAIL actual SDK gas price image not visible')
PIXELS
   exit 0
  elif [[ "$stage" == "ERROR" ]]; then cat "$container/Documents/probe-stage.json";exit 1;fi
 fi
 sleep 0.2
done
echo "SDK_RENDER_PROBE_TIMEOUT"
exit 1
