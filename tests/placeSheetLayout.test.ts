import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { loadModule } from './helpers/loadModule';

const exported = (value: unknown) => ({ __esModule: true, default: value });
const jsx = (type: unknown, props: any) => ({ type, props });

for (const name of ['PlaceBottomSheet', 'TempPlaceSheet']) {
  test(`${name}: 시트 이동은 본문 마스크의 높이나 여백을 바꾸지 않는다`, () => {
    const path = `components/map/${name}.tsx`;
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let attributes: ts.JsxAttributes | undefined;
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'BottomSheet') attributes = node.attributes;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(attributes);
    const sheetAttributes = attributes;
    const enabled = (key: string) => {
      const attr = sheetAttributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === key) as ts.JsxAttribute | undefined;
      return attr ? !attr.initializer || attr.initializer.getText(ast) === '{true}' : undefined;
    };

    let position = 450;
    let keyboardShown = false;
    const shared = (get: () => unknown) => ({ get });
    const context = {
      enableDynamicSizing: false,
      enableContentPanningGesture: true,
      overDragResistanceFactor: 2.5,
      animatedPosition: shared(() => position),
      animatedLayoutState: shared(() => ({ containerHeight: 844, handleHeight: 16, contentHeight: 1600 })),
      animatedDetentsState: shared(() => ({ highestDetentPosition: 0 })),
      animatedSheetHeight: shared(() => 844),
      animatedKeyboardState: shared(() => ({ status: keyboardShown ? 1 : 0, heightWithinContainer: keyboardShown ? 300 : 0 })),
      isInTemporaryPosition: shared(() => false),
    };
    // 설치된 라이브러리의 실제 본문 마스크 스타일을 카메라·API 없이 재생한다.
    const { BottomSheetContent } = loadModule<{ BottomSheetContent: (props: any) => any }>(
      'node_modules/@gorhom/bottom-sheet/src/components/bottomSheet/BottomSheetContent.tsx',
      {
        react: { ...exported({}), memo: (c: unknown) => c, useMemo: (fn: () => unknown) => fn() },
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-native-reanimated': {
          ...exported({ View: 'View' }),
          useDerivedValue: (fn: () => unknown) => shared(fn),
          useAnimatedStyle: (fn: () => unknown) => ({ current: fn }),
        },
        '../../hooks': { useBottomSheetInternal: () => context },
        '../../constants': {
          INITIAL_LAYOUT_VALUE: -999,
          KEYBOARD_BEHAVIOR: { extend: 'extend', fillParent: 'fillParent', interactive: 'interactive' },
          KEYBOARD_STATUS: { SHOWN: 1 },
        },
        '../../utilities': { animate: ({ point }: { point: number }) => point },
        '../bottomSheetDraggableView': exported('DraggableView'),
      },
    );
    const tree = BottomSheetContent({ detached: enabled('detached'), keyboardBehavior: 'extend' });
    const style = tree.props.style[1].current;
    const original = style();
    // 축소→확장→축소→닫기. 본문 크기는 유지하고 바깥 시트만 이동해야 한다.
    for (position of [400, 300, 200, 100, 0, 100, 250, 450, 600, 844]) {
      assert.deepEqual(style(), original);
    }
    assert.equal(original.height - original.paddingBottom, 828);
    keyboardShown = true;
    assert.equal(style().height - style().paddingBottom, 528);
    keyboardShown = false;
    assert.deepEqual(style(), original);
    assert.equal(enabled('enableOverDrag'), false, '고정 본문은 끝점을 넘겨 화면 아래 틈을 만들지 않는다');
  });
}
