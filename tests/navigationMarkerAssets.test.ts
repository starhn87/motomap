import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('길안내 네이티브 원형 아이콘은 일반 지도 원본과 이름·바이트가 일치한다',()=>{
  const source=new URL('../assets/images/markers/',import.meta.url);
  const bundled=new URL('../modules/kakao-navi/ios/Resources/MapMarkers/',import.meta.url);
  const names=readdirSync(source).filter(name=>/_circle.*\.png$/.test(name)).sort();
  assert.equal(names.length,20);
  assert.deepEqual(readdirSync(bundled).sort(),names);
  for(const name of names)assert.deepEqual(readFileSync(new URL(name,bundled)),readFileSync(new URL(name,source)),name);
});
