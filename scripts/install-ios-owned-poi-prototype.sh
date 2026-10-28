#!/bin/bash
# 실기기 수동 POI 검증 앱을 잠시 설치한다. 앱을 삭제하지 않고 데이터 컨테이너를 유지한다.
# .env를 셸에 주입하고 MOTOMAP_DEVICE_APP / MOTOMAP_DEVICE_ID를 지정해 실행한다.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d /tmp/motomap-owned-poi-device.XXXXXX)
echo "Prototype artifacts: $work"
fullapp=${MOTOMAP_DEVICE_APP:?full Release app path required}
device=${MOTOMAP_DEVICE_ID:?paired device identifier required}
app="$work/RerouteDeviceProbe.app"
installed=0
cleanup() {
 if [[ "$installed" == 1 ]]; then
  xcrun devicectl device install app --device "$device" "$fullapp" > "$work/restore-install.log" 2>&1 || { echo 'RESTORE_FAILED'; return; }
  xcrun devicectl device process launch --device "$device" com.ridemap.app > "$work/restore-launch.log" 2>&1 || true
  echo 'FULL_APP_RESTORED'
 fi
 rm -rf "$app"
}
trap cleanup EXIT
codesign --verify --deep --strict "$fullapp"
mkdir -p "$app/Frameworks"
for framework in KNSDK KMLocationSDK KakaoSDKCommon RNCryptor Realm RealmSwift Alamofire; do
 cp -R "$fullapp/Frameworks/$framework.framework" "$app/Frameworks/"
done
python3 - "$root" "$work" "$fullapp" "$app" <<'PY'
import sys,plistlib,os,hashlib,uuid
from pathlib import Path
root,work,full,app=map(Path,sys.argv[1:])
src=(root/'modules/kakao-navi/ios/KNNaviPresenter.m').read_text()
assert src.count('static const BOOL KNNaviGuideMenuActionsEnabled = NO;')==1
assert 'static const BOOL KNNaviRouteEditingEnabled = YES;' in src
(work/'KNNaviPresenter.m').write_text(src)
info=plistlib.loads((full/'Info.plist').read_bytes())
info['CFBundleExecutable']='RerouteDeviceProbe';info['CFBundleDisplayName']='모토맵 검증'
info.pop('UILaunchStoryboardName',None);info.pop('NSMainStoryboardFile',None)
info['UILaunchScreen']={}
info['UIApplicationSceneManifest']={'UISceneConfigurations':{'UIWindowSceneSessionRoleApplication':[{'UISceneConfigurationName':'RerouteChecks','UISceneDelegateClassName':'ProbeScene'}]}}
assert info['CFBundleIdentifier']=='com.ridemap.app'
assert 'location' in info['UIBackgroundModes']
(app/'Info.plist').write_bytes(plistlib.dumps(info))
run_id=str(uuid.uuid4())
(work/'run-id.txt').write_text(run_id)
(app/'ProbeConfig.plist').write_bytes(plistlib.dumps({'key':os.environ['KAKAO_NATIVE_APP_KEY'],'runId':run_id,'autoSmoke':os.environ.get('MOTOMAP_PROTOTYPE_AUTOSMOKE')=='1'}))
(work/'product-presenter.sha256').write_text(hashlib.sha256(src.encode()).hexdigest()+'\n')
PY
sdkroot=$(xcrun --sdk iphoneos --show-sdk-path)
xcrun clang -fobjc-arc -fmodules -target arm64-apple-ios16.4 -isysroot "$sdkroot" \
 -I "$root/modules/kakao-navi/ios" -I "$root/tests/ios" -F "$root/ios/Pods/KNSDK-UI/KNSDK.xcframework/ios-arm64" -F "$root/ios/Pods/LocationCocoaPod/KMLocationSDK.xcframework/ios-arm64" -F "$app/Frameworks" -framework KNSDK \
 -framework WebKit -framework UIKit -framework Foundation -framework AVFoundation -framework CoreLocation \
 -Wl,-rpath,@executable_path/Frameworks \
 "$work/KNNaviPresenter.m" \
 "$root/modules/kakao-navi/ios/KNNaviTheme.m" \
 "$root/modules/kakao-navi/ios/KNSDKBridge.m" \
 "$root/modules/kakao-navi/ios/KNNaviAudioFocus.m" \
 "$root/modules/kakao-navi/ios/KNNaviArrivalRecovery.m" \
 "$root/modules/kakao-navi/ios/KNNaviRouteView.m" \
 "$root/modules/kakao-navi/ios/KNNaviBottomPanel.m" \
 "$root/modules/kakao-navi/ios/KNNaviHiddenViews.m" \
 "$root/modules/kakao-navi/ios/KNNaviHazardSheet.m" \
 "$root/modules/kakao-navi/ios/KNNaviGasPriceLayer.m" \
 "$root/modules/kakao-navi/ios/KNNaviGuidePoiOverlay.m" \
 "$root/modules/kakao-navi/ios/KNNaviGuidePoiArtwork.m" \
 "$root/modules/kakao-navi/ios/KNNaviOwnedPoiLayer.m" \
 "$root/tests/ios/KNNaviOwnedPoiFixtures.m" \
 "$root/modules/kakao-navi/ios/KNNaviGasLayer.m" \
 "$root/tests/ios/OwnedPoiDevicePrototype.m" -o "$app/RerouteDeviceProbe" > "$work/compile.log" 2>&1
mkdir -p "$app/MotoMapNavigationVoice.bundle" "$app/MotoMapNavigationUI.bundle"
cp "$root/modules/kakao-navi/ios/Resources/navigation-start.mp3" "$app/MotoMapNavigationVoice.bundle/"
cp "$root/modules/kakao-navi/ios/Resources/navigation-bottom.html" "$app/MotoMapNavigationUI.bundle/"
cp "$root"/modules/kakao-navi/ios/Resources/GasBrands/*.png "$app/MotoMapNavigationUI.bundle/"
cp "$fullapp/embedded.mobileprovision" "$app/"
codesign -d --entitlements :- "$fullapp" > "$work/entitlements.plist" 2>/dev/null
identity=$(security find-identity -v -p codesigning | python3 -c 'import sys,re; s=sys.stdin.read(); m=re.search(r"([A-F0-9]{40}) .*Apple Development",s); assert m; print(m[1])')
codesign --force --sign "$identity" --entitlements "$work/entitlements.plist" "$app" > "$work/signing.log" 2>&1
codesign --verify --deep --strict "$app"
xcrun devicectl device install app --device "$device" "$app" > "$work/install.log" 2>&1
installed=1
xcrun devicectl device process launch --device "$device" --terminate-existing com.ridemap.app > "$work/launch.log" 2>&1
# 인증·실제 안내 지도 준비 실패 시 전체 앱을 복구한다. 이전 실행의 준비 파일은 믿지 않는다.
ready=0
deadline=$((SECONDS+120))
while (( SECONDS < deadline )); do
 rm -f "$work/ready.json"
 if xcrun devicectl device copy from --device "$device" --source Documents/owned-poi-ready.json \
   --domain-type appDataContainer --domain-identifier com.ridemap.app \
   --destination "$work/ready.json" --timeout 5 > "$work/readiness-copy.log" 2>&1; then
  verdict=$(python3 - "$work" <<'PY'
import json,sys
from pathlib import Path
work=Path(sys.argv[1]); data=json.loads((work/'ready.json').read_text())
print('stale' if data.get('runId')!=(work/'run-id.txt').read_text() else 'error' if data.get('error') else 'ready' if data.get('event')=='prototype_ready' else 'pending')
PY
)
  if [[ "$verdict" == ready ]]; then ready=1;break;fi
  if [[ "$verdict" == error ]]; then echo 'Prototype initialization failed; restoring full app.';exit 1;fi
 fi
 sleep 2
done
if [[ "$ready" != 1 ]]; then echo 'Prototype readiness timed out; restoring full app.';exit 1;fi
if [[ "${MOTOMAP_PROTOTYPE_AUTOSMOKE:-0}" == 1 ]]; then
 echo 'SDK smoke passed; restoring full app.'
 exit 0
fi
# 준비된 뒤에만 사용자가 실제 손가락으로 검사할 수 있도록 시제품을 유지한다.
installed=0
{
 printf '#!/bin/bash\nset -euo pipefail\n'
 printf 'xcrun devicectl device install app --device %q %q\n' "$device" "$fullapp"
 printf 'xcrun devicectl device process launch --device %q --terminate-existing com.ridemap.app\n' "$device"
} > "$work/restore-full-app.sh"
printf '%s\n' "Prototype ready for manual gestures. After testing: bash $work/restore-full-app.sh"
