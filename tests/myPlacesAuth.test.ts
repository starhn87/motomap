import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from 'zustand';
import { useDialogStore } from '../lib/dialog';
import { loadModule } from './helpers/loadModule';

const home = { name: '집', address: '주소', latitude: 37, longitude: 127 };
const signedIn = (id: string) => ({ status: 'signed_in', session: { user: { id } } });
const guest = { status: 'signed_out', session: null };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture(initial = signedIn('a'), stored = JSON.stringify({ home })) {
  const auth = create<{ status: string; session: { user: { id: string } } | null }>(() => initial);
  let saved: string | null = stored;
  let write: Promise<void> | undefined;
  const { useMyPlacesStore: places } = loadModule<{ useMyPlacesStore: typeof import('../stores/useMyPlacesStore').useMyPlacesStore }>(
    'stores/useMyPlacesStore.ts',
    {
      zustand: { create },
      '@/lib/dialog': { useDialogStore },
      '@/stores/useAuthStore': { useAuthStore: auth },
      '@react-native-async-storage/async-storage': {
        __esModule: true,

        default: {
          getItem: async () => saved,
          setItem: async (_key: string, value: string) => { await write; saved = value; },
          removeItem: async () => { saved = null; },
        },
      },
    },
  );
  return { auth, places, saved: () => saved, delayWrite: (promise: Promise<void>) => { write = promise; } };
}

test('로그아웃이 저장 중이어도 집·회사 값이 다시 생기지 않고 비로그인 저장도 막는다', async () => {
  const { auth, places, saved, delayWrite } = fixture();
  await places.getState().load();
  assert.equal(JSON.stringify(places.getState().places.home), JSON.stringify(home));
  assert.equal(JSON.parse(saved()!).owner, 'a');
  let finish!: () => void;
  delayWrite(new Promise<void>(resolve => { finish = resolve; }));
  const saving = places.getState().save('work', home);
  await flush();
  useDialogStore.getState().show({ title: '집', message: home.address, buttons: [], maskMessage: true });
  auth.setState(guest);
  assert.equal(useDialogStore.getState().dialog, null);
  assert.equal(places.getState().enabled, false);
  assert.equal(Object.keys(places.getState().places).length, 0);
  await places.getState().save('home', home);
  finish();
  await saving;
  await flush();
  assert.equal(saved(), null);

  auth.setState(signedIn('a'));
  await places.getState().load();
  assert.equal(Object.keys(places.getState().places).length, 0);
});

test('계정을 바로 전환해도 이전 계정의 집·회사를 읽지 않는다', async () => {
  const { auth, places, saved } = fixture();
  await places.getState().load();
  auth.setState(signedIn('b'));
  await places.getState().load();
  assert.equal(saved(), null);
  assert.equal(Object.keys(places.getState().places).length, 0);
});

test('삭제 전에 앱이 종료됐어도 다른 계정으로 다시 실행하면 집·회사를 읽지 않는다', async () => {
  const { places } = fixture(signedIn('b'), JSON.stringify({ owner: 'a', places: { home } }));
  await places.getState().load();
  assert.equal(places.getState().loaded, true);
  assert.equal(places.getState().places.home, undefined);
});
