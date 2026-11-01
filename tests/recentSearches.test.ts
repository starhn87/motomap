import assert from 'node:assert/strict';
import test from 'node:test';
import { loadModule } from './helpers/loadModule';

function setup() {
  const store = new Map<string, string>();
  const AsyncStorage = {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  };
  return loadModule<any>('lib/recentSearches.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
  }, { JSON });
}

const riding = (i: number) => ({ type: 'riding', id: `r${i}`, name: `라이딩 ${i}` });

test('최근 검색은 5개를 넘겨 저장하고 최신순·중복 제거를 유지한다', async () => {
  const mod = setup();
  for (let i = 0; i < 8; i++) await mod.addRecentSearch(riding(i));
  let list = await mod.addRecentSearch(riding(2));
  assert.equal(list.length, 8);
  assert.equal(list.slice(0, 2).map((e: any) => e.id).join(), 'r2,r7');
  for (let i = 8; i < 40; i++) list = await mod.addRecentSearch(riding(i));
  assert.equal(list.length, mod.MAX_RECENT_SEARCHES);
  assert.equal(list[0].id, 'r39');
});
