import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GUIDE_MENU_ACTIONS_ENABLED, GUIDE_ROUTE_EDITING_ENABLED } from '../lib/guideMenuPolicy';

test('위험 제보·주유소 메뉴는 계속 닫고 경로 편집을 분리해 제공한다',()=>{
  assert.equal(GUIDE_MENU_ACTIONS_ENABLED,false);
  assert.equal(GUIDE_ROUTE_EDITING_ENABLED,true);
});
test('실제 하단 메뉴는 목적지 변경·음량·종료만 제공한다',()=>{
  const panel = readFileSync(new URL('../components/navigation/IOSGuidePanel.tsx', import.meta.url), 'utf8');
  const actions = [...new Set([...panel.matchAll(/act\('([^']+)'/g)].map(match => match[1]))].sort();
  assert.deepEqual(actions, ['end', 'menu', 'recenter', 'refresh', 'routeEdit', 'volume']);
  assert.match(panel, /accessibilityRole="adjustable" accessibilityLabel="안내 음량"/);
  assert.match(panel, /안내 음소거/);
  assert.match(panel, /목적지 변경/);
  assert.doesNotMatch(panel, /다른 경로|경로 편집/);
});

test('Android RN 길안내와 WebView 폴백은 iOS 리소스 제거 뒤에도 각각 시작할 수 있다', () => {
  const entry = readFileSync('index.js', 'utf8');
  assert.match(entry, /registerComponent\('MotoMapAndroidGuide'/);
  assert.match(entry, /registerComponent\('MotoMapGuidePanel'/);
  const gradle = readFileSync('modules/kakao-navi/android/build.gradle', 'utf8');
  assert.match(gradle, /motomapGuideRenderer.*!= 'web'/);
  const html = readFileSync('modules/kakao-navi/android/src/main/assets/motomap-guide/navigation-bottom.html', 'utf8');
  assert.match(html, /목적지 변경/);
  assert.ok(readFileSync('modules/kakao-navi/android/src/main/assets/motomap-guide/Pretendard-Regular.woff2').length > 0);
});
