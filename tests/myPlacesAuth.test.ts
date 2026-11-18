import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from 'zustand';
import { useDialogStore } from '../lib/dialog';
import type { MyPlace, MyPlaces, MyPlaceSlot } from '../stores/useMyPlacesStore';
import { loadModule } from './helpers/loadModule';

const home = { name: '집', address: '주소', latitude: 37, longitude: 127 };
const work = { ...home, name: '회사' };
const signedIn = (id: string) => ({ status: 'signed_in', session: { user: { id } } });
const guest = { status: 'signed_out', session: null };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
type Server = Map<string, Map<MyPlaceSlot, MyPlace | null>>;

function fixture(initial = signedIn('a'), stored: string | null = null, server: Server = new Map()) {
  const auth = create<{ status: string; session: { user: { id: string } } | null }>(() => initial);
  let saved = stored;
  let read: Promise<void> | undefined;
  let unavailable = false;
  function rows(owner: string) {
    const account = server.get(owner) ?? new Map<MyPlaceSlot, MyPlace | null>();
    server.set(owner, account);
    return account;
  }
  const { useMyPlacesStore: places } = loadModule<typeof import('../stores/useMyPlacesStore')>(
    'stores/useMyPlacesStore.ts',
    {
      zustand: { create },
      '@/lib/dialog': { useDialogStore },
      '@/stores/useAuthStore': { useAuthStore: auth },
      '@/lib/api/personalPlaces': {
        fetchAccountPlaces: async (owner: string) => {
          await read;
          if (unavailable) throw new Error('offline');
          return Object.fromEntries([...rows(owner)].filter(([, value]) => value !== null));
        },
        importAccountPlaces: async (owner: string, local: MyPlaces) => {
          if (unavailable) throw new Error('offline');
          for (const slot of ['home', 'work'] as const) {
            const value = local[slot];
            if (value && !rows(owner).has(slot)) rows(owner).set(slot, value);
          }
        },
        saveAccountPlace: async (owner: string, slot: MyPlaceSlot, value?: MyPlace) => {
          if (unavailable) throw new Error('offline');
          rows(owner).set(slot, value ?? null);
        },
      },
      '@react-native-async-storage/async-storage': {
        __esModule: true,
        default: {
          getItem: async () => saved,
          setItem: async (_key: string, value: string) => { saved = value; },
          removeItem: async () => { saved = null; },
        },
      },
    }, { AbortController },
  );
  const ready = async () => {
    await places.getState().load();
    await places.getState().refreshAccount();
  };
  return { auth, places, ready, saved: () => saved, offline: (value: boolean) => { unavailable = value; },
    delayRead: (promise: Promise<void>) => { read = promise; } };
}

test('한 기기에만 있던 값이 같은 계정의 다른 기기에 동기화되고 로그아웃으로 서버 값이 삭제되지 않는다', async () => {
  const server: Server = new Map();
  const first = fixture(signedIn('a'), JSON.stringify({ owner: 'a', places: { home } }), server);
  const second = fixture(signedIn('a'), null, server);
  await first.ready();
  assert.equal(first.saved(), null);
  await second.ready();
  assert.deepEqual({ ...second.places.getState().places.home }, home);
  assert.equal(await second.places.getState().save('work', work), true);
  await first.places.getState().refreshAccount();
  assert.deepEqual(first.places.getState().places.work, work);

  useDialogStore.getState().show({ title: '집', message: home.address, buttons: [], maskMessage: true });
  first.auth.setState(guest);
  assert.equal(useDialogStore.getState().dialog, null);
  assert.equal(first.places.getState().enabled, false);
  assert.equal(Object.keys(first.places.getState().places).length, 0);
  assert.equal(await first.places.getState().save('home', home), false);
  assert.equal(server.get('a')?.size, 2);
  first.auth.setState(signedIn('a'));
  await first.ready();
  assert.deepEqual(first.places.getState().places.work, work);
});

test('오래된 기기의 값으로 다른 기기에서 설정하거나 삭제한 슬롯을 덮지 않는다', async () => {
  const server: Server = new Map([['a', new Map<MyPlaceSlot, MyPlace | null>([['home', null], ['work', work]])]]);
  const f = fixture(signedIn('a'), JSON.stringify({ owner: 'a', places: { home, work: home } }), server);
  await f.ready();
  assert.equal(f.saved(), null);
  assert.equal(f.places.getState().places.home, undefined);
  assert.deepEqual(f.places.getState().places.work, work);
});

test('동기화에 실패하면 이전 기기의 유일한 사본을 보존하고 저장 실패를 알린다', async () => {
  const f = fixture(signedIn('a'), JSON.stringify({ owner: 'a', places: { home } }));
  f.offline(true);
  await f.ready();
  assert.deepEqual({ ...f.places.getState().places.home }, home);
  assert.equal(JSON.parse(f.saved()!).owner, 'a');
  assert.equal(await f.places.getState().save('work', work), false);
  assert.equal(f.places.getState().places.work, undefined);
  await f.places.getState().refreshAccount();
  f.offline(false);
  await f.places.getState().refreshAccount();
  assert.equal(f.saved(), null);
});

test('계정이 바뀌면 이전 계정의 늦은 서버 응답과 이전 기기 값을 표시하지 않는다', async () => {
  const server: Server = new Map([['a', new Map([['home', home]])]]);
  const f = fixture(signedIn('a'), null, server);
  let release!: () => void;
  f.delayRead(new Promise<void>(resolve => { release = resolve; }));
  await f.places.getState().load();
  await flush();
  f.auth.setState(signedIn('b'));
  assert.equal(Object.keys(f.places.getState().places).length, 0);
  release();
  await f.ready();
  assert.equal(Object.keys(f.places.getState().places).length, 0);
  assert.equal(server.get('a')?.size, 1);
});

test('다른 계정으로 다시 실행할 때 기기 값이 새 계정으로 넘어가지 않는다', async () => {
  const server: Server = new Map();
  const f = fixture(signedIn('b'), JSON.stringify({ owner: 'a', places: { home } }), server);
  await f.ready();
  assert.equal(f.places.getState().loaded, true);
  assert.equal(f.places.getState().places.home, undefined);
  assert.equal(server.get('b')?.size, 0);
});

test('소유자를 알 수 없는 기기 주소는 현재 계정에 표시하거나 전송하지 않는다', async () => {
  const server: Server = new Map();
  const f = fixture(signedIn('b'), JSON.stringify({ home }), server);
  await f.ready();
  assert.equal(f.places.getState().places.home, undefined);
  assert.equal(server.get('b')?.size, 0);
});
