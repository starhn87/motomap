import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';

type Element = { type: unknown; props: Record<string, any> };
function fixture(options: { needsLegal?: boolean; consent?:()=>Promise<void>; legal?:()=>Promise<void> } = {}) {
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
    'react-native':{Modal:'Modal',Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:(v:unknown)=>v}},
    '@/constants/legal':{LEGAL_DOCS:documents},
    '@/lib/legalConsent':{acceptCurrentLegalDocuments:async()=>{calls.push('legal'); await options.legal?.();}},
    '@/lib/locationPrivacy':{LOCATION_CONSENT_VERSION:'2026-10-11-location-v2',LOCATION_PROVIDERS:['kakao','kma','airkorea','opinet','anthropic'],
      LOCATION_PROVIDER_DETAILS:{kakao:'routes',kma:'weather',airkorea:'air',opinet:'gas',anthropic:'AI'},
      RECIPIENT_LABELS:{kakao:'카카오',kma:'기상청',airkorea:'한국환경공단',opinet:'한국석유공사',anthropic:'Anthropic'}},
    '@/stores/useLocationPrivacyStore':{useLocationPrivacyStore:Object.assign(()=>state,{getState:()=>state})},
    '@/stores/useAuthStore':{useAuthStore:{getState:()=>({session:{access_token:`test-token-${actor}`,user:{id:actor}},refreshOnboardingStatus:async()=>{calls.push('refresh');},signOut:async()=>{}})}},
  };
  new Script(code).runInNewContext({module,exports:module.exports,require:(name:string)=>{
    if(!(name in dependencies)) throw new Error(`미지정 약관 UI 의존성: ${name}`); return dependencies[name];
  }});
  return {render:()=>{cursor=0;return module.exports.default({needsLegal:options.needsLegal ?? true});},
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
  return elements(f.render()).find(n=>n.type==='Pressable' && n.props.accessibilityState?.disabled!==undefined
    && elements(n).some(c=>c.props.children==='동의하고 시작하기'))!;
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
