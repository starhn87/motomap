import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

const jsx = (type: any, props: any) => ({ type, props });
const { default: layer, MapOverlayHost: host } = loadModule<any>('components/map/MapOverlayLayer.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { View: 'View', StyleSheet: { create: (styles: object) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } },
  '@gorhom/portal': { Portal: 'Portal', PortalHost: 'PortalHost' },
});

test('지도 시트는 루트의 같은 host로 보내고 포커스가 바뀌어도 자식을 유지한다', () => {
  const sheet = jsx('Sheet', {});
  const shown = layer({ focused: true, children: sheet });
  const hidden = layer({ focused: false, children: sheet });
  assert.equal(shown.type, 'Portal');
  assert.equal(shown.props.hostName, host().props.children.props.name);
  assert.equal(hidden.type, shown.type);
  assert.equal(hidden.props.children.props.children, sheet);
  assert.equal(hidden.props.children.props.style[1].display, 'none');
  assert.equal(hidden.props.children.props.style[1].opacity, undefined);
  assert.equal(shown.props.children.props.pointerEvents, 'box-none');
  assert.equal(host().props.pointerEvents, 'box-none', '빈 레이어가 지도/탭 터치를 가로채지 않는다');
});

test('스택의 장소 상세는 탭 위 루트 포털 대신 해당 화면에서 렌더한다', () => {
  const sheet = jsx('Sheet', {});
  const shown = layer({ focused: true, inline: true, children: sheet });
  assert.equal(shown.type, 'View');
  assert.equal(shown.props.children, sheet);
  assert.ok(shown.props.style[2].elevation > 0);
  assert.equal(shown.props.pointerEvents, 'box-none');
});
