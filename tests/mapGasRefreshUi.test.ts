import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { loadModule } from './helpers/loadModule';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const nativeFlattenSource = readFileSync(new URL('../node_modules/react-native/Libraries/StyleSheet/flattenStyle.js', import.meta.url), 'utf8');
const flattenedModule = { exports: {} as { default: (style: unknown) => any } };
new Script(babel.transformSync(nativeFlattenSource, {
  configFile: false, babelrc: false,
  plugins: ['babel-plugin-syntax-hermes-parser', '@babel/plugin-transform-flow-strip-types', '@babel/plugin-transform-modules-commonjs'],
}).code).runInNewContext({ module: flattenedModule, exports: flattenedModule.exports });
const flattenStyle = flattenedModule.exports.default;
const utils = loadModule<any>('node_modules/react-native-reanimated/src/createAnimatedComponent/utils.ts', {});
const { PropsFilter } = loadModule<any>('node_modules/react-native-reanimated/src/createAnimatedComponent/PropsFilter.tsx', {
  '../animation': { initialUpdaterRun: (fn: () => unknown) => fn() },
  '../css/utils': { isCSSConfigProp: () => false },
  '../isSharedValue': { isSharedValue: () => false },
  '../WorkletEventHandler': { WorkletEventHandler: class {} },
  './InlinePropManager': { hasInlineStyles: () => false },
  './utils': utils,
});

// 실제 MapHome의 가스 재검색 JSX와 위치 계산을 AST 경계로 실행한다.
const source = readFileSync(new URL('../components/map/MapHome.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('MapHome.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression: ts.Expression | undefined;
let styles: ts.Expression | undefined;
let followStyle: ts.Expression | undefined;
function visit(node: ts.Node) {
  if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)) {
    let first: ts.Expression = node.expression;
    while (ts.isBinaryExpression(first)) first = first.left;
    if (ts.isIdentifier(first) && first.text === 'showGasRefresh') expression = node.expression;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (node.name.text === 'styles') styles = node.initializer;
    if (node.name.text === 'myLocationFollowStyle') followStyle = node.initializer;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(expression && styles && followStyle);
const { code } = transformSync(`const styles = ${styles.getText(ast)};
const myLocationFollowStyle = ${followStyle.getText(ast)};
export default () => ({ tree: (${expression.getText(ast)}), styles, myLocationFollowStyle });`, {
  loader: 'tsx', format: 'cjs', jsx: 'automatic',
});

type Element = { type: string; props: any };
function fixture(overrides: Record<string, unknown> = {}) {
  let retries = 0;
  const module = { exports: {} as { default: () => any } };
  const jsx = (type: string, props: unknown) => ({ type, props });
  new Script(code).runInNewContext({
    module, exports: module.exports, require: () => ({ jsx, jsxs: jsx }),
    StyleSheet: { create: (style: unknown) => style },
    Animated: { View: 'AnimatedView' }, AnimatedPressable: 'AnimatedPressable', Pressable: 'Pressable',
    View: 'View', Text: 'Text', ActivityIndicator: 'Spinner', Ionicons: 'Icon',
    FadeIn: { duration: () => ({}) }, useAnimatedStyle: (fn: () => unknown) => fn(),
    containerHeight: { value: 0 }, sheetPosition: { value: 999999 },
    showGasRefresh: true, selectedStation: null, placeDetailOpen: false, weatherOpen: false,
    gasFetching: false, gasError: null, stations: [],
    colors: { surfaceElevated: 'white', border: 'gray', text: 'black', tint: 'black' },
    refreshGasHere: () => retries++, ...overrides,
  });
  return { ...module.exports.default(), retries: () => retries };
}
function nativeNodes(element: Element, pressed = false): any[] {
  if (!element?.props) return [];
  let props = element.props;
  if (element.type.startsWith('Animated')) props = new PropsFilter().filterNonAnimatedProps({ props, _isFirstRender: true });
  const pressable = element.type === 'Pressable' || element.type === 'AnimatedPressable';
  const style = flattenStyle(pressable && typeof props.style === 'function' ? props.style({ pressed }) : props.style);
  const children = Array.isArray(props.children) ? props.children : [props.children];
  return [{ type: element.type, props, style }, ...children.flatMap((child: Element) => nativeNodes(child, pressed))];
}

test('재검색은 Reanimated·Pressable 스타일 처리 후에도 지도 위 절대 배치를 유지한다', () => {
  for (const state of [{}, { gasFetching: true }, { gasError: new Error('fixture'), stations: [{}] }]) {
    const view = fixture(state);
    const nodes = nativeNodes(view.tree);
    const anchor = nodes.find(node => node.style?.position === 'absolute');
    assert.ok(anchor, '스타일 콜백이 소실되어 재검색이 지도 아래 일반 행이 되면 실패한다');
    assert.equal(anchor.style.alignSelf, 'center');
    assert.equal(anchor.style.bottom + anchor.style.height / 2,
      view.myLocationFollowStyle.bottom + view.styles.myLocationButton.height / 2);
    assert.equal(anchor.style.height, 44);
    assert.equal(anchor.style.maxWidth, '55%');
  }
});

test('재검색의 눌림·스피너·재시도와 시트 열림 숨김을 유지한다', () => {
  const idle = fixture();
  const pressed = nativeNodes(idle.tree, true).find(node => node.props.accessibilityRole === 'button');
  assert.equal(pressed.style.opacity, 0.68);
  pressed.props.onPress();
  assert.equal(idle.retries(), 1);
  const loading = nativeNodes(fixture({ gasFetching: true }).tree);
  assert.equal(loading.find(node => node.props.accessibilityRole === 'button').props.accessibilityState.busy, true);
  assert.equal(loading.filter(node => node.type === 'Spinner').length, 1);
  for (const state of [{ showGasRefresh: false }, { selectedStation: {} }, { placeDetailOpen: true }, { weatherOpen: true }]) {
    assert.equal(fixture(state).tree, false);
  }
});
