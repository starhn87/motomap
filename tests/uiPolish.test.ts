import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { transformSync } from 'esbuild';
import ts from 'typescript';

type Element = { type: unknown; props: Record<string, any> };
const colors = { text: 'black', textSecondary: 'gray', background: 'white', surface: 'white', tint: 'black', border: 'gray' };

// 앱의 실제 JSX를 실행한다. 네이티브 터치 감각·화면 크기는 이 대역 검사의 범위가 아니다.
function renderPart(file: string, select: (node: ts.Node) => boolean, values: Record<string, unknown> = {}): Element {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let target: ts.Node | undefined;
  let styles: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (select(node)) target = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'styles') styles = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(target && styles, `검사할 실제 JSX와 스타일이 필요함: ${file}`);
  const { code } = transformSync(`const styles = ${styles.getText(ast)}; export default () => (${target.getText(ast)});`, {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
  });
  const module = { exports: {} as { default: () => Element } };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  new Script(code).runInNewContext({
    module, exports: module.exports, require: () => ({ jsx, jsxs: jsx }),
    StyleSheet: { create: (style: unknown) => style, hairlineWidth: 0.5, absoluteFill: { position: 'absolute', inset: 0 } },
    Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner',
    Ionicons: 'Icon', BikeIcon: 'BikeIcon', GarageCard: 'GarageCard',
    colors, semantic: { danger: 'red' }, ...values,
  });
  return module.exports.default();
}

function returnedBy(name: string) {
  return (node: ts.Node) => ts.isJsxElement(node) && ts.isParenthesizedExpression(node.parent)
    && ts.isReturnStatement(node.parent.parent)
    && ts.isBlock(node.parent.parent.parent)
    && ts.isFunctionDeclaration(node.parent.parent.parent.parent)
    && node.parent.parent.parent.parent.name?.text === name;
}
function nodes(element: any): Element[] {
  if (Array.isArray(element)) return element.flatMap(nodes);
  return element?.props ? [element, ...nodes(element.props.children)] : [];
}
function flat(style: any): any {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {};
}
function text(element: Element) {
  return nodes(element).filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
}

test('내 정보 메뉴는 손을 뗀 상태로 즉시 돌아오고 스프링이나 레이아웃 변환을 쓰지 않는다', () => {
  let presses = 0;
  const menu = renderPart('app/(tabs)/profile.tsx', returnedBy('MenuItem'), {
    label: '즐겨찾기', icon: null, trailing: undefined, danger: false, onPress: () => presses++,
  });
  assert.equal(menu.type, 'Pressable');
  assert.equal(flat(menu.props.style({ pressed: true })).opacity, 0.7);
  assert.equal(flat(menu.props.style({ pressed: false })).opacity, 1);
  assert.equal(flat(menu.props.style({ pressed: true })).transform, undefined);
  assert.equal(menu.props.onPressOut, undefined);
  menu.props.onPress();
  assert.equal(presses, 1);
});

test('제보 종류 선택은 선택 상태와 손을 누르는 동안의 피드백을 구분한다', () => {
  let selected = '';
  const tab = renderPart('app/(tabs)/submit.tsx', returnedBy('SubmitTypeTab'), {
    type: 'place', isActive: true, label: '장소', onPress: (type: string) => { selected = type; },
  });
  assert.equal(tab.props.accessibilityState.selected, true);
  assert.equal(flat(tab.props.style({ pressed: true })).opacity, 0.7);
  assert.equal(flat(tab.props.style({ pressed: false })).opacity, 1);
  tab.props.onPress();
  assert.equal(selected, 'place');
});

test('전송 중에는 제보 문구 공간을 유지하면서 스피너만 표시하고 중복 탭을 막는다', () => {
  const select = (node: ts.Node) => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.getText() === 'onPress'
    && prop.initializer?.getText() === '{handleSubmit}');
  for (const submitting of [false, true]) {
    const button = renderPart('app/(tabs)/submit.tsx', select, { submitting, pickingPhotos: false, handleSubmit() {} });
    assert.equal(button.type, 'Pressable');
    assert.equal(button.props.disabled, submitting);
    assert.equal(button.props.accessibilityState.busy, submitting);
    assert.equal(nodes(button).filter(node => node.type === 'Spinner').length, submitting ? 1 : 0);
    const label = nodes(button).find(node => node.type === 'Text')!;
    assert.equal(label.props.children, '장소 제보하기');
    assert.equal(flat(label.props.style).opacity, submitting ? 0 : 1);
    assert.equal(flat(button.props.style({ pressed: false })).transform, undefined);
  }
});

test('차고가 비었을 때 등록 진입은 하나이며 바이크가 있으면 상단 추가가 유지된다', () => {
  for (const bikes of [[], [{ id: 'fixture' }]]) {
    let opened = 0;
    const view = renderPart('app/edit-bike.tsx', returnedBy('EditBikeScreen'), {
      bikes, rideStats: { rides: 0 }, openNew: () => opened++, activatingId: null, colors,
      openEdit() {}, handleActivate() {},
    });
    const buttons = nodes(view).filter(node => node.type === 'Pressable');
    assert.equal(buttons.length, 1);
    assert.match(text(buttons[0]), bikes.length ? /추가/ : /내 바이크 등록/);
    buttons[0].props.onPress();
    assert.equal(opened, 1);
    if (!bikes.length) {
      assert.ok(!text(view).includes('내 정체성'));
      assert.match(text(view), /리뷰와 방문 기록/);
    }
  }
});
