import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GUIDE_MENU_ACTIONS_ENABLED, GUIDE_ROUTE_EDITING_ENABLED } from '../lib/guideMenuPolicy';

test('위험 제보·주유소 메뉴는 계속 닫고 경로 편집을 분리해 제공한다',()=>{
  assert.equal(GUIDE_MENU_ACTIONS_ENABLED,false);
  assert.equal(GUIDE_ROUTE_EDITING_ENABLED,true);
});
test('실제 하단 메뉴는 목적지 변경·다른 경로·음량·종료를 제공한다',()=>{
  const html=readFileSync(new URL('../modules/kakao-navi/ios/Resources/navigation-bottom.html',import.meta.url),'utf8');
  const actions=[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]).sort();
  assert.deepEqual(actions,['end','menu','recenter','refresh','routeEdit','routePreview']);
  assert.match(html,/type="range" id="volume"/);
  assert.match(html,/id="mute"/);
  assert.match(html,/data-action="routeEdit"[^\n]*<span>목적지 변경<\/span>[\s\S]*data-action="routePreview"[^\n]*<span>다른 경로<\/span>/);
  assert.doesNotMatch(html,/경로 편집/);
  assert.doesNotMatch(html,/viasLabel|class="actions"/);
});
