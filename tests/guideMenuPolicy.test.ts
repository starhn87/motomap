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
