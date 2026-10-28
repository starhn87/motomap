import assert from 'node:assert/strict';
import test from 'node:test';
import { guidePreviewInitial, continuedViaPlaces, continuedGoal, proposeGuidePoiPreview } from '@/lib/guidePreview';
import type { GuidePreviewSnapshot } from '@/modules/kakao-navi';

const goal = { name: '목적지', latitude: 37.5, longitude: 127.1, placeId: 'goal', courseId: 'course' };
const passed = { name: '지난 카페', latitude: 37.4, longitude: 127.1, placeId: 'passed' };
const removed = { name: '삭제한 카페', latitude: 37.45, longitude: 127.1, placeId: 'removed' };
const remaining = { name: '남은 카페', latitude: 37.48, longitude: 127.1, placeId: 'remaining' };
const snapshot: GuidePreviewSnapshot = { token: 5, start: { latitude: 37.42, longitude: 127.11 }, goal,
  priority: 2, passedVias: [passed], vias: [removed, remaining] };
const previous = [passed, removed, remaining];
const flat = (points: { longitude: number; latitude: number }[]) => points.flatMap((p) => [p.longitude, p.latitude]);

test('자체 catalog로 검증한 목적지·경유지는 새 ID를 유지하고 이전 인접 ID를 재사용하지 않는다',()=>{
  const newPoint={name:'새 장소',latitude:goal.latitude,longitude:goal.longitude};
  const proposed=proposeGuidePoiPreview(snapshot,newPoint,false,false,{placeId:'verified-new'});
  const initial=guidePreviewInitial(proposed,goal,previous);
  assert.equal(initial.goal.placeId,'verified-new');assert.equal(initial.courseId,undefined);
  const via=proposeGuidePoiPreview({...snapshot,vias:[remaining]},remaining,true,false,{placeId:'verified-via'});
  const viaInitial=guidePreviewInitial(via,goal,previous);
  assert.equal(viaInitial.userVias[0].placeId,'verified-via');
});

test('현재 GPS부터 기존 목적지·남은 경유지로 미리보기를 열고 장소 정체성을 유지한다', () => {
  const initial = guidePreviewInitial(snapshot, goal, previous);
  assert.deepEqual(initial.start, [127.11, 37.42]);
  assert.equal(initial.startName, null);
  assert.equal(initial.goal.placeId, 'goal');
  assert.deepEqual(initial.userVias.map((v) => v.placeId), ['removed', 'remaining']);
});

test('경유지를 삭제해 재안내해도 이미 지난 장소는 보존하고 삭제한 미방문 장소는 기록하지 않는다', () => {
  const vias = continuedViaPlaces(snapshot, previous, [remaining], flat([remaining]));
  assert.deepEqual(vias.map((v) => v.placeId), ['passed', 'remaining']);
});

test('미리보기 중 새로 통과한 경유지는 완료 기록을 유지하며 중복을 제거한다', () => {
  const vias = continuedViaPlaces({ ...snapshot, passedVias: [passed, removed] }, previous, [removed, remaining], flat([remaining]));
  assert.deepEqual(vias.map((v) => v.placeId), ['passed', 'removed', 'remaining']);
});

test('코스 샘플이 많아도 경유지를 자르지 않는다', () => {
  const multi = { ...snapshot, vias: Array.from({ length: 12 }, (_, i) => ({ ...remaining, longitude: 127 + i * .01 })) };
  const initial = guidePreviewInitial(multi, goal, previous);
  assert.equal(initial.courseVias.length, 24);
  assert.equal(initial.userVias.length, 0);
});

test('원코스 목적지·남은 경로를 유지한 경우에만 코스 완주 맥락을 유지한다', () => {
  assert.equal(continuedGoal(snapshot, goal, goal, flat(snapshot.vias)).courseId, 'course');
  assert.equal(continuedGoal(snapshot, goal, goal, flat([remaining])).courseId, undefined);
  assert.equal(continuedGoal(snapshot, goal, { ...goal, latitude: 37.6 }, flat(snapshot.vias)).courseId, undefined);
});

test('미리보기 중 실제 통과한 코스 경유지는 자동 제외해도 원코스 완주 맥락을 유지한다', () => {
  assert.equal(continuedGoal(snapshot, goal, goal, flat([remaining]), [passed, removed]).courseId, 'course');
});

test('같은 지점을 두 번 방문하는 코스는 통과 횟수만큼만 제외한다', () => {
  const loop = { ...snapshot, passedVias: [], vias: [remaining, removed, remaining] };
  assert.equal(continuedGoal(loop, goal, goal, flat([removed, remaining]), [remaining]).courseId, 'course');
  assert.equal(continuedGoal(loop, goal, goal, flat([removed]), [remaining]).courseId, undefined);
});


test('native 목적지가 먼저 바뀐 동안 이전 JS 코스 ID를 새 목적지에 붙이지 않는다', () => {
  const changed = { ...snapshot, goal: { ...goal, latitude: 37.7 } };
  assert.equal(guidePreviewInitial(changed, goal, previous).courseId, undefined);
  assert.equal(continuedGoal(changed, goal, changed.goal, flat(changed.vias)).courseId, undefined);
});


test('GPS가 끊겨도 편집 스냅샷을 열고 출발 좌표는 새 위치 수신까지 비워둔다', () => {
  const initial = guidePreviewInitial({ ...snapshot, start: null }, goal, previous);
  assert.equal(initial.start, null);
  assert.equal(initial.goal.name, goal.name);
  assert.equal(initial.userVias.length, 2);
});

test('주유소 목적지는 5m 이내라도 기존 장소·코스 ID를 상속하지 않는다', () => {
  const changed = { ...snapshot, goalReplaced: true, goal: { name: '주유소', latitude: goal.latitude, longitude: goal.longitude } };
  const initial = guidePreviewInitial(changed, goal, previous);
  assert.equal(initial.goal.placeId, undefined); assert.equal(initial.courseId, undefined);
  assert.equal(continuedGoal(changed, goal, initial.goal, flat(changed.vias)).courseId, undefined);
});
test('추가한 주유소 경유에는 근접한 기존 장소 ID를 상속하지 않는다', () => {
  const initial = guidePreviewInitial({ ...snapshot, gasViaAdded: true, vias: [remaining] }, goal, previous);
  assert.equal(initial.userVias[0].placeId, undefined);
});


test('기존 장소 경유 삭제 후 같은 좌표의 주유소 경유에 라이딩 기록을 다시 붙이지 않는다', () => {
  const gas = { name: '주유소', latitude: remaining.latitude, longitude: remaining.longitude };
  const changed = { ...snapshot, gasViaAdded: true, vias: [gas, remaining] };
  assert.deepEqual(continuedViaPlaces(changed,[remaining],[gas],flat([gas])),[]);
  assert.equal(continuedViaPlaces(changed,[remaining],[gas,remaining],flat([gas,remaining]))[0].placeId,'remaining');
});

test('같은 목적지의 경로 재선택은 방문 정체성을 유지하고 새 목적지는 이어받지 않는다', () => {
  const original = { ...goal, visitIdentity: {} };
  const next = continuedGoal(snapshot, original, { ...goal }, flat(snapshot.vias));
  assert.equal(next.visitIdentity, original.visitIdentity);
  const changed = continuedGoal({ ...snapshot, goalReplaced: true }, original, { ...goal }, flat(snapshot.vias));
  assert.equal(changed.visitIdentity, undefined);
});

test('POI 경유 추가는 첫 경유로 넣고 인접한 등록 장소 ID를 상속하지 않는다',()=>{
  const point={...remaining,name:'지도 POI'};
  const proposed=proposeGuidePoiPreview({...snapshot,vias:[remaining]},point,true,false);
  const initial=guidePreviewInitial(proposed,goal,previous);
  assert.equal(initial.userVias[0]?.placeId,undefined);
  assert.equal(initial.userVias[1]?.placeId,'remaining');
  assert.equal(proposed.vias.length,2);assert.equal(snapshot.vias.length,2);
});
test('POI 목적지 변경은 동일 좌표여도 이전 목적지·코스 정체성을 버린다',()=>{
  const proposed=proposeGuidePoiPreview(snapshot,{...goal,name:'지도 POI'},false,true);
  const initial=guidePreviewInitial(proposed,goal,previous);
  assert.equal(initial.goal.placeId,undefined);assert.equal(initial.courseId,undefined);assert.equal(proposed.vias.length,0);
});
test('POI는 경유지 3개·고정 코스 상한과 좌표 유효성을 넘지 않는다',()=>{
  assert.throws(()=>proposeGuidePoiPreview({...snapshot,vias:[remaining,remaining,remaining]},goal,true,false),/via_limit/);
  assert.throws(()=>proposeGuidePoiPreview(snapshot,goal,true,true),/via_limit/);
  assert.throws(()=>proposeGuidePoiPreview(snapshot,{...goal,latitude:NaN},false,false),/invalid_point/);
});
