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

function evaluate(source: string, scope: Record<string, unknown>) {
  const { outputText } = ts.transpileModule(`result = () => (${source});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  const context = { ...scope, result: () => undefined };
  new Script(outputText).runInNewContext(context);
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

for (const sheet of ['PlaceBottomSheet', 'TempPlaceSheet']) {
  test(`${sheet}: 확장과 축소 중에 제목 옆 버튼을 다시 만들지 않는다`, () => {
    const row = findSource(`components/map/${sheet}.tsx`, node =>
      ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p =>
        ts.isJsxAttribute(p) && p.name.getText() === 'style' && p.initializer?.getText() === '{styles.nameRow}')
        ? node : undefined);
    const controls = { type: 'actions' };
    let rendered = 0;
    for (const isExpanded of [false, true, false]) {
      const load = evaluate(row, {
        React: { createElement() {} },
        View: 'View', Pressable: 'Pressable', Animated: { View: 'AnimatedView' },
        Text: 'Text', styles: {}, colors: {}, isExpanded,
        advanceSheet() {}, displayPlace: { name: '장소' }, place: { name: '장소' },
        inlineActionsVisibility: {}, renderActions: () => { rendered += 1; return controls; },
      });
      load();
    }
    assert.equal(rendered, 3);
  });
}
