import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';

type Element = { type: unknown; props: Record<string, any> };
function fixture(options: { needsLegal?: boolean; showProvidersInline?: boolean; consent?:()=>Promise<void>; legal?:()=>Promise<void> } = {}) {
  const states: any[]=[]; let cursor=0; let actor='A'; const calls: string[]=[];
  let consentArgs: unknown[]=[];
  const state={actor:'A',version:null,providers:[],historyAllowed:false,ready:true,
    consent:async(...args:unknown[])=>{calls.push('location'); consentArgs=args; await options.consent?.();},
    browse:()=>calls.push('browse'),load:async()=>{}};
  const source=readFileSync(new URL('../components/auth/LegalConsentScreen.tsx',import.meta.url),'utf8');
  const {code}=transformSync(source,{loader:'tsx',format:'cjs',jsx:'automatic'});
  const documents=Object.fromEntries(['terms','privacy','location'].map(type=>[type,{title:type,content:`current-${type}-body`}]));
  const module={exports:{} as {default:(props: Record<string,unknown>)=>Element}};
  const dependencies: Record<string,unknown>={
    react:{useState(initial:any){const i=cursor++; if(!(i in states)) states[i]=typeof initial==='function'?initial():initial;
      return [states[i],(v:any)=>{states[i]=typeof v==='function'?v(states[i]):v;}];},
      useRef(initial:any){const i=cursor++; if(!(i in states)) states[i]={current:initial}; return states[i];}},
    'react/jsx-runtime':{jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})},
    'react-native':{ActivityIndicator:'ActivityIndicator',Modal:'Modal',Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:(v:unknown)=>v}},
    '@/constants/legal':{LEGAL_DOCS:documents},
    '@/lib/legalConsent':{acceptCurrentLegalDocuments:async()=>{calls.push('legal'); await options.legal?.();}},
    '@/lib/locationPrivacy':{LOCATION_CONSENT_VERSION:'2026-10-11-location-v2',LOCATION_PROVIDERS:['kakao','kma','airkorea','opinet','anthropic','tmap'],
      LOCATION_PROVIDER_DETAILS:{kakao:'routes',kma:'weather',airkorea:'air',opinet:'gas',anthropic:'AI',tmap:'주변 장소 검색: 약2km 격자'},
      RECIPIENT_LABELS:{kakao:'카카오',kma:'기상청',airkorea:'한국환경공단',opinet:'한국석유공사',anthropic:'Anthropic',tmap:'TMAP'}},
    '@/stores/useLocationPrivacyStore':{useLocationPrivacyStore:Object.assign(()=>state,{getState:()=>state})},
    '@/stores/useAuthStore':{useAuthStore:{getState:()=>({session:{access_token:`test-token-${actor}`,user:{id:actor}},refreshOnboardingStatus:async()=>{calls.push('refresh');},signOut:async()=>{}})}},
  };
  new Script(code).runInNewContext({module,exports:module.exports,require:(name:string)=>{
    if(!(name in dependencies)) throw new Error(`미지정 약관 UI 의존성: ${name}`); return dependencies[name];
  }});
  return {render:()=>{cursor=0;return module.exports.default({needsLegal:options.needsLegal ?? true,showProvidersInline:options.showProvidersInline ?? false});},
    calls,consentArgs:()=>JSON.parse(JSON.stringify(consentArgs)),actor:(next:string)=>{actor=next;}};
}
function elements(node:any):Element[]{
  if(Array.isArray(node)) return node.flatMap(elements);
  if(!node || typeof node!=='object' || !node.props) return [];
  return [node,...elements(node.props.children)];
}
function checkAll(f:ReturnType<typeof fixture>){
  elements(f.render()).filter(n=>n.props.accessibilityRole==='checkbox').forEach(n=>n.props.onPress());
}
function submit(f:ReturnType<typeof fixture>){
  return elements(f.render()).find(n=>n.type==='Pressable' && ['동의하고 시작하기','동의하고 저장'].includes(n.props.accessibilityLabel))!;
}
test('처음에는 미선택 기본 동의만 보이고 공급자 선택은 자세히 보기에 담는다',()=>{
  const f=fixture(); const nodes=elements(f.render());
  assert.equal(nodes.filter(n=>n.props.accessibilityRole==='checkbox').length,3);
  assert.ok(nodes.filter(n=>n.props.accessibilityRole==='checkbox').every(n=>!n.props.accessibilityState.checked));
  assert.equal(submit(f).props.disabled,true);
  const locationOnly=fixture({needsLegal:false});
  assert.equal(elements(locationOnly.render()).filter(n=>n.props.accessibilityRole==='checkbox').length,1);
});
test('문서 보기는 동의 버전의 내장 본문이며 닫아도 체크 상태를 유지한다',()=>{
  const f=fixture(); elements(f.render()).find(n=>n.props.accessibilityRole==='checkbox')!.props.onPress();
  for(const type of ['terms','privacy','location']){
    elements(f.render()).find(n=>n.props.accessibilityLabel===`${type} 보기`)!.props.onPress();
    const nodes=elements(f.render()); const modal=nodes.find(n=>n.type==='Modal')!;
    assert.equal(modal.props.visible,true); assert.ok(elements(modal).some(n=>n.props.children===`current-${type}-body`));
    nodes.find(n=>n.props.accessibilityLabel==='약관 문서 닫기')!.props.onPress();
    assert.equal(elements(f.render()).find(n=>n.type==='Modal')!.props.visible,false);
    assert.equal(elements(f.render()).find(n=>n.props.accessibilityRole==='checkbox')!.props.accessibilityState.checked,true);
  }
});
test('통합 동의는 위치 동의 다음 약관 저장·인증 갱신 순서이며 기록 저장을 임의로 켜지 않는다',async()=>{
  const f=fixture(); checkAll(f); await submit(f).props.onPress();
  await new Promise(done=>setTimeout(done,0));
  assert.deepEqual(f.calls,['location','legal','refresh']);
  assert.deepEqual(f.consentArgs().slice(0,3),[true,true,false]);
});
test('미선택 공급자는 통합 동의에도 전달하지 않는다',async()=>{
  const f=fixture();
  elements(f.render()).find(n=>n.props.accessibilityLabel==='location 보기')!.props.onPress();
  const modal=elements(f.render()).find(n=>n.type==='Modal')!;
  const kakao=elements(modal).find(n=>n.props.accessibilityRole==='checkbox' && elements(n).some(c=>c.props.children==='카카오'))!;
  kakao.props.onPress(); elements(f.render()).find(n=>n.props.accessibilityLabel==='약관 문서 닫기')!.props.onPress();
  checkAll(f); submit(f).props.onPress(); await new Promise(done=>setTimeout(done,0));
  assert.ok(!f.consentArgs()[3].includes('kakao'));
});
test('연속 탭은 한 번만 제출하고 실패 시 체크를 유지해 같은 화면에서 재시도한다',async()=>{
  let resolve!:()=>void; const pending=new Promise<void>(done=>{resolve=done;});
  const f=fixture({consent:()=>pending,legal:async()=>{throw new Error('legal offline');}}); checkAll(f);
  const button=submit(f); button.props.onPress(); button.props.onPress(); assert.deepEqual(f.calls,['location']);
  resolve(); await new Promise(done=>setTimeout(done,0));
  assert.deepEqual(f.calls,['location','legal']); assert.equal(submit(f).props.disabled,false);
  assert.ok(elements(f.render()).some(n=>n.props.accessibilityRole==='alert'));
});
test('동의 도중 계정이 바뀌면 새 계정에 약관을 수락시키지 않는다',async()=>{
  let resolve!:()=>void; const pending=new Promise<void>(done=>{resolve=done;});
  const f=fixture({consent:()=>pending}); checkAll(f); submit(f).props.onPress(); f.actor('B'); resolve();
  await new Promise(done=>setTimeout(done,0)); assert.deepEqual(f.calls,['location']);
});
test('이미 약관을 확인한 이용자는 위치 동의만 저장하고 두 번째 동의 화면을 만들지 않는다',async()=>{
  const f=fixture({needsLegal:false}); checkAll(f); submit(f).props.onPress(); await new Promise(done=>setTimeout(done,0));
  assert.deepEqual(f.calls,['location']);
});

test('동의 문구는 연령·이용·전달 의미를 유지하면서 짧게 표시한다',()=>{
  const f=fixture({needsLegal:false});
  const checkbox=elements(f.render()).find(n=>n.props.accessibilityRole==='checkbox')!;
  assert.ok(elements(checkbox).some(n=>n.props.children==='만 14세 이상 · 위치 이용·전달 동의'));
  const terms=elements(fixture().render()).filter(n=>n.props.accessibilityRole==='checkbox');
  assert.ok(elements(terms[0]).some(n=>n.props.children==='만 14세 이상 · 이용약관 동의'));
});

test('저장 중 버튼에는 문구 대신 스피너만 표시하고 크기·접근성·중복 탭 차단을 유지한다',async()=>{
  let resolve!:()=>void; const pending=new Promise<void>(done=>{resolve=done;});
  const f=fixture({consent:()=>pending}); checkAll(f);
  const before=submit(f); const beforeStyle=before.props.style({pressed:false})[0];
  before.props.onPress();
  const during=submit(f);
  assert.equal(during.props.disabled,true);
  assert.equal(during.props.accessibilityState.busy,true);
  assert.deepEqual(during.props.style({pressed:false})[0],beforeStyle);
  assert.equal(elements(during).filter(n=>n.type==='ActivityIndicator').length,1);
  assert.equal(elements(during).filter(n=>n.type==='Text').length,0);
  during.props.onPress(); assert.deepEqual(f.calls,['location']);
  resolve(); await new Promise(done=>setTimeout(done,0));
  assert.equal(submit(f).props.accessibilityState.busy,false);
  assert.ok(elements(submit(f)).some(n=>n.props.children==='동의하고 시작하기'));
});

test('새 TMAP 제공자는 기본 꺼짐이며 자세히 보기에서 직접 켠 경우만 동의한다',async()=>{
  const defaults=fixture();checkAll(defaults);submit(defaults).props.onPress();
  await new Promise(done=>setTimeout(done,0));
  assert.ok(!defaults.consentArgs()[3].includes('tmap'));
  const f=fixture();elements(f.render()).find(n=>n.props.accessibilityLabel==='location 보기')!.props.onPress();
  const tmap=elements(f.render()).find(n=>n.props.accessibilityRole==='checkbox'&&elements(n).some(c=>c.props.children==='TMAP'))!;
  assert.equal(tmap.props.accessibilityState.checked,false);tmap.props.onPress();
  elements(f.render()).find(n=>n.props.accessibilityLabel==='약관 문서 닫기')!.props.onPress();
  checkAll(f);submit(f).props.onPress();await new Promise(done=>setTimeout(done,0));
  assert.ok(f.consentArgs()[3].includes('tmap'));
});

function visibleElements(node:any):Element[]{
  if(Array.isArray(node))return node.flatMap(visibleElements);
  if(!node||typeof node!=='object'||!node.props||(node.type==='Modal'&&!node.props.visible))return [];
  return [node,...visibleElements(node.props.children)];
}
test('설정의 동의 범위 변경은 약관 보기를 누르지 않아도 TMAP을 선택하고 저장할 수 있다',async()=>{
  const f=fixture({needsLegal:false,showProvidersInline:true});
  const tmap=visibleElements(f.render()).find(n=>n.props.accessibilityRole==='checkbox'&&elements(n).some(c=>c.props.children==='TMAP'));
  assert.ok(tmap,'설정 본문에 TMAP 선택이 보여야 한다');assert.equal(tmap.props.accessibilityState.checked,false);
  tmap.props.onPress();
  const agreement=visibleElements(f.render()).find(n=>n.props.accessibilityRole==='checkbox'&&elements(n).some(c=>c.props.children==='만 14세 이상 · 위치 이용·전달 동의'))!;
  agreement.props.onPress();assert.equal(submit(f).props.accessibilityLabel,'동의하고 저장');
  submit(f).props.onPress();await new Promise(done=>setTimeout(done,0));
  assert.ok(f.consentArgs()[3].includes('tmap'));
  const source=readFileSync(new URL('../components/LocationPrivacyPanel.tsx',import.meta.url),'utf8');
  assert.match(source,/<LegalConsentScreen needsLegal=\{false\} showProvidersInline/);
});
test('기존 온보딩은 제공자 목록을 본문에 자동 노출하지 않고 설정 모달에는 중복 선택을 만들지 않는다',()=>{
  const onboard=fixture({needsLegal:false});assert.equal(visibleElements(onboard.render()).filter(n=>n.props.accessibilityRole==='checkbox').length,1);
  const f=fixture({needsLegal:false,showProvidersInline:true});
  visibleElements(f.render()).find(n=>n.props.accessibilityLabel==='location 보기')!.props.onPress();
  const modal=visibleElements(f.render()).find(n=>n.type==='Modal')!;
  assert.equal(elements(modal).filter(n=>n.props.accessibilityRole==='checkbox').length,0);
});
