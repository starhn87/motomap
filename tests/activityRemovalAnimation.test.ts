import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';
test('활동 행 삭제의 native 레이아웃 애니메이션은 줄어든 동작 설정을 따른다', () => {
  for (const reduced of [true, false]) {
    const calls: any[] = [];
    const module = loadModule<any>('hooks/useActivityLayoutAnimation.ts', {
      'react-native': { LayoutAnimation: { configureNext: (config: any) => calls.push(config) } },
      'react-native-reanimated': { useReducedMotion: () => reduced },
    });
    module.useActivityLayoutAnimation()();
    assert.equal(calls.length, reduced ? 0 : 1);
    if (!reduced) {
      assert.equal(calls[0].duration, 200);
      assert.equal(calls[0].update.type, 'easeInEaseOut');
      assert.equal(calls[0].delete.property, 'opacity');
    }
  }
});
