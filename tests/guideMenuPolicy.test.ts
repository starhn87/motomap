import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GUIDE_MENU_ACTIONS_ENABLED } from '../lib/guideMenuPolicy';

test('1.2.10 배포 메뉴 정책은 부가 기능을 열지 않는다',()=>{
  assert.equal(GUIDE_MENU_ACTIONS_ENABLED,false);
});
test('실제 하단 문서는 음량·종료와 기존 접힌 바 제어만 제공한다',()=>{
  const html=readFileSync(new URL('../modules/kakao-navi/ios/Resources/navigation-bottom.html',import.meta.url),'utf8');
  const actions=[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]).sort();
  assert.deepEqual(actions,['end','menu','recenter','refresh']);
  assert.match(html,/type="range" id="volume"/);
  assert.match(html,/id="mute"/);
  assert.doesNotMatch(html,/viasLabel|class="actions"/);
});
