import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../node_modules/@mj-studio/react-native-naver-map/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const android = 'android/src/main/java/com/mjstudio/reactnativenavermap/';

// 설치된 소스의 patch 누락을 검사한다. codegen·컴파일·실기기 검증을 대체하지 않는다.
test('네이버 양 플랫폼 SDK가 같은 검토 버전에 고정된다', () => {
  assert.equal(JSON.parse(read('package.json')).version, '2.9.1');
  assert.match(read('mj-studio-react-native-naver-map.podspec'), /"NMapsMap", "3\.24\.0"/);
  assert.match(read('android/gradle.properties'), /^NaverMap_sdkVersion=3\.24\.0$/m);
});

test('심벌 탭의 JS spec·콜백과 iOS/Android 이벤트 연결을 보존한다', () => {
  assert.match(read('src/spec/RNCNaverMapViewNativeComponent.ts'), /onTapSymbol\?: DirectEventHandler/);
  assert.match(read('src/component/NaverMapView.tsx'), /onTapSymbol=\{onTapSymbolProp \? onTapSymbol : undefined\}/);
  assert.match(read('ios/RNCNaverMapViewImpl.mm'), /emitter->onTapSymbol/);
  assert.match(read(`${android}mapview/RNCNaverMapView.kt`), /setOnSymbolClickListener/);
  assert.match(read(`${android}mapview/RNCNaverMapViewManager.kt`), /registerDirectEvent\(this, NaverMapSymbolTapEvent.EVENT_NAME\)/);
  assert.match(read(`${android}event/NaverMapSymbolTapEvent.kt`), /EVENT_NAME = "topTapSymbol"/);
});
