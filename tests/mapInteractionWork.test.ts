import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

function findSource<T extends ts.Node>(path: string, find: (node: ts.Node) => T | undefined) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function scan(node: ts.Node): T | undefined {
    return find(node) ?? ts.forEachChild(node, scan);
  }
  const match = scan(ast);
  assert.ok(match);
  return match.getText(ast);
}

function evaluate<T = unknown>(source: string, scope: Record<string, unknown>): () => T {
  const { outputText } = ts.transpileModule(`result = () => (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  const context: { result?: () => T } = { ...scope };
  new Script(outputText).runInNewContext(context);
  assert.ok(context.result);
  return context.result;
}

test('같은 날씨 격자의 GPS 좌표들은 지도 화면 구독값을 바꾸지 않는다', () => {
  const source = findSource('components/map/MapHome.tsx', node =>
    ts.isVariableDeclaration(node) && node.name.getText() === 'weatherLat' ? node.initializer : undefined);
  const location = { latitude: 37.501, longitude: 127.001 };
  const latitude = evaluate(source, {
    userLocation: location,
    useMapStore: (selector: (state: { userLocation: typeof location }) => number) =>
      selector({ userLocation: location }),
    weatherGridCoordinate: (n: number) => Number(n.toFixed(2)),
  });
  const before = latitude();
  location.latitude = 37.504;
  assert.equal(latitude(), before);
  location.latitude = 37.506;
  assert.notEqual(latitude(), before);
});

test('확장 중 제목 옆 버튼은 자리를 유지하고 터치와 접근성만 비활성화된다', () => {
  const row = findSource('components/map/PlaceSheetHeader.tsx', node =>
    ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p =>
      ts.isJsxAttribute(p) && p.name.getText() === 'style' && p.initializer?.getText() === '{styles.nameRow}')
      ? node : undefined);
  const actions = { type: 'actions' };
  for (const expanded of [false, true, false]) {
    type Slot = { children: unknown[]; props: { pointerEvents: string; accessibilityElementsHidden: boolean } };
    const render = evaluate<{ children: Slot[] }>(row, {
      React: { createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }) },
      View: 'View', Pressable: 'Pressable', Animated: { View: 'AnimatedView' }, StyleSheet: {},
      Text: 'Text', styles: {}, colors: {}, expanded, children: actions, visibility: {}, onPress() {}, name: '장소',
    });
    const slot = render().children[2];
    assert.equal(slot.children[0], actions);
    assert.equal(slot.props.pointerEvents, expanded ? 'none' : 'auto');
    assert.equal(slot.props.accessibilityElementsHidden, expanded);
  }
});
