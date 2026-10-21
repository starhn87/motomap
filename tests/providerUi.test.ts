import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';
import { loadModule } from './helpers/loadModule';
import * as distance from '../lib/distance';
import type { useGasLayer } from '../hooks/useGasLayer';

type Element = { type: unknown; props: Record<string, any> };

function weatherButton() {
  const source = readFileSync(new URL('../components/map/WeatherFab.tsx', import.meta.url), 'utf8');
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
  const module = { exports: {} as { default: (props: Record<string, unknown>) => Element } };
  const scales: { value: number }[] = [];
  const colors = { background: 'black', border: 'gray', text: 'white', textSecondary: 'gray' };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': {
      jsx: (type: unknown, props: unknown) => ({ type, props }),
      jsxs: (type: unknown, props: unknown) => ({ type, props }),
    },
    'react-native': { ActivityIndicator: 'Spinner', Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: (value: unknown) => value } },
    '@expo/vector-icons/Ionicons': 'Icon',
    'react-native-reanimated': {
      default: { createAnimatedComponent: (value: unknown) => value },
      __esModule: true,
      useSharedValue: (value: number) => { const scale = { value }; scales.push(scale); return scale; },
      useAnimatedStyle: (fn: () => unknown) => fn(),
      withTiming: (value: number) => value,
      cancelAnimation() {},
    },
    '@/constants/Colors': { light: colors },
    '@/components/useColorScheme': { useColorScheme: () => 'light' },
    '@/components/weather/WeatherEmoji': 'WeatherEmoji',
  };
  new Script(code).runInNewContext({ module, exports: module.exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`미지정 날씨 버튼 의존성: ${name}`);
    return dependencies[name];
  } });
  return { render: module.exports.default, scales };
}

test('날씨 최초 실패·조회 중에도 동일한 버튼 공간과 재시도 상태를 유지한다', () => {
  const { render } = weatherButton();
  let retries = 0;
  const failed = render({ failed: true, open: false, onRetry: () => retries++ });
  assert.equal(failed.props.children[1].props.children, '재시도');
  assert.equal(failed.props.style[0].width, 52);
  assert.equal(failed.props.style[0].height, 52);
  assert.equal(failed.props.disabled, false);
  failed.props.onPress();
  assert.equal(retries, 1);
  const loading = render({ refreshing: true, open: false });
  assert.equal(loading.props.disabled, true);
  assert.equal(loading.props.accessibilityState.busy, true);
  assert.equal(loading.props.children[0].type, 'Spinner');
  assert.equal(loading.props.children[1], false);
  assert.equal(loading.props.style[0].width, 52);
  assert.equal(loading.props.style[0].height, 52);
});

test('이전 날씨는 명시적으로 표시하고 기존 상세 토글·터치 해제 즉시 복원을 유지한다', () => {
  const { render, scales } = weatherButton();
  let opens = 0;
  const weather = { current: { temp: 20, emoji: '☀️' }, gradeColor: 'green' };
  const normal = render({ weather, open: false, onPress: () => opens++ });
  assert.equal(normal.props.children[1].props.children, '20°');
  normal.props.onPressIn();
  assert.equal(scales[0].value, 0.82);
  normal.props.onPressOut();
  assert.equal(scales[0].value, 1);
  const cached = render({ weather, failed: true, open: true, onPress: () => opens++ });
  assert.equal(cached.props.children[1].props.children, '이전 예보');
  assert.equal(cached.props.style[2].borderColor, 'gray');
  assert.match(cached.props.accessibilityLabel, /이전 예보.*닫기/);
  cached.props.onPress();
  assert.equal(opens, 1);
});

test('날씨·유가 재시도는 안내와 원래 문구 공간을 유지하고 진행 문구 대신 스피너를 표시한다',()=>{
  const cases=[
    {file:'WeatherSheet',label:'날씨 다시 확인',flag:'refreshing'},
    {file:'GasStationCard',label:'주유소 상세 유가 다시 확인',flag:'isFetching'},
    {file:'TempPlaceSheet',label:'이 장소의 유가 다시 확인',flag:'gasFetching'},
  ];
  function nodes(node:any):Element[]{
    if(Array.isArray(node)) return node.flatMap(nodes);
    return node?.props ? [node,...nodes(node.props.children)] : [];
  }
  for(const item of cases){
    const source=readFileSync(new URL(`../components/map/${item.file}.tsx`,import.meta.url),'utf8');
    const start=source.lastIndexOf('<Pressable',source.indexOf(`accessibilityLabel="${item.label}"`));
    const end=source.indexOf('</Pressable>',start)+'</Pressable>'.length;
    assert.ok(start>=0 && end>start);
    const fragment=source.slice(start,end);
    const {code}=transformSync(`export default function Retry(){return (${fragment});}`,{loader:'tsx',format:'cjs',jsx:'automatic'});
    function render(loading:boolean){
      const module={exports:{} as {default:()=>Element}};
      new Script(code).runInNewContext({module,exports:module.exports,
        require:()=>({jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})}),
        Pressable:'Pressable',View:'View',Text:'Text',ActivityIndicator:'Spinner',
        styles:{gradeComment:{},meta:{},tradeAt:{},providerRetry:{}},StyleSheet:{absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0}},
        colors:{textSecondary:'gray',tint:'green'},[item.flag]:loading,
        detail:true,fuelPrices:[{}],onRetry(){},refetch(){},refetchGas(){},
      });
      return module.exports.default();
    }
    const idle=render(false),loading=render(true);
    assert.equal(idle.props.disabled,false); assert.equal(loading.props.disabled,true);
    assert.equal(loading.props.accessibilityState.busy,true);
    assert.equal(nodes(loading).filter(n=>n.type==='Spinner').length,1);
    const idleTexts=nodes(idle).filter(n=>n.type==='Text'),loadingTexts=nodes(loading).filter(n=>n.type==='Text');
    assert.equal(JSON.stringify(loadingTexts.map(n=>n.props.children)),JSON.stringify(idleTexts.map(n=>n.props.children)));
    assert.ok(!loadingTexts.some(n=>String(n.props.children).includes('확인 중')));
    const action=loadingTexts.find(n=>n.props.children==='다시 시도')!;
    assert.ok(action.props.style.some((s:any)=>s?.opacity===0),'스피너 중에도 원래 문구의 공간은 유지한다');
  }
});

function gasLayer() {
  const state: unknown[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let effectCursor = 0;
  const effectDeps: unknown[][] = [];
  const products: unknown[] = [];
  let retries = 0;
  const query = { data: [], error: new Error('fixture'), isFetching: false, refetch: () => { retries++; return Promise.resolve(); } };
  const hooks = loadModule<{ useGasLayer: typeof useGasLayer }>('hooks/useGasLayer.ts', {
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next: unknown) => { state[index] = next; }];
      },
      useEffect(fn: () => void, deps: unknown[]) {
        const index = effectCursor++;
        const previous = effectDeps[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) effects.push(fn);
        effectDeps[index] = deps;
      },
    },
    '@/hooks/useGasStations': { useGasStations: (_spec: unknown, _enabled: boolean, prod: unknown) => { products.push(prod); return query; } },
    '@/lib/distance': distance,
  });
  const args = { active: true, prod: 'B027' as 'B027' | 'B034', mapReady: true, mapCenter: { latitude: 37.5, longitude: 127, zoom: 14 }, screenWidth: 400, screenHeight: 800 };
  function render() {
    cursor = 0;
    effectCursor = 0;
    effects = [];
    const result = hooks.useGasLayer(args);
    effects.forEach(fn => fn());
    return result;
  }
  render();
  return { args, query, render, products, retries: () => retries };
}

test('유종을 바꾸면 즉시 선택 카드를 닫고 되돌려도 이전 카드가 재등장하지 않는다', () => {
  const fixture = gasLayer();
  fixture.render().setSelectedStation({ id: 'regular' } as any);
  assert.equal(fixture.render().selectedStation?.id, 'regular');
  fixture.args.prod = 'B034';
  assert.equal(fixture.render().selectedStation, null);
  assert.equal(fixture.products.at(-1), 'B034');
  fixture.args.prod = 'B027';
  assert.equal(fixture.render().selectedStation, null);
});

test('유가 실패에서 같은 지도 범위 재시도는 실제 refetch를 한 번 호출하고 선택 카드를 닫는다', () => {
  const fixture = gasLayer();
  let layer = fixture.render();
  assert.equal(layer.showGasRefresh, true);
  assert.equal(layer.gasError, fixture.query.error);
  layer.setSelectedStation({ id: 'fixture' } as any);
  layer = fixture.render();
  layer.refreshHere();
  assert.equal(fixture.retries(), 1);
  assert.equal(fixture.render().selectedStation, null);
});

test('다른 지도 범위 재검색·조회 중에는 이전 쿼리를 중복 호출하지 않는다', () => {
  const fixture = gasLayer();
  fixture.args.mapCenter = { ...fixture.args.mapCenter, longitude: 128 };
  fixture.render().refreshHere();
  assert.equal(fixture.retries(), 0);
  fixture.query.isFetching = true;
  fixture.render().refreshHere();
  assert.equal(fixture.retries(), 0);
  fixture.args.active = false;
  fixture.render();
  assert.equal(fixture.render().showGasRefresh, false);
});
