import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const MANIFEST_PREFIX = 'motomap-secure-v1:';
const CHUNK_SIZE_BYTES = 1800;

interface ChunkManifest {
  generation: string;
  count: number;
}

const pendingLegacyKeys = new Set<string>();

function isKeychainInteractionUnavailable(error: unknown): boolean {
  return (
    Platform.OS === 'ios' &&
    error instanceof Error &&
    error.message.includes('User interaction is not allowed')
  );
}

async function waitForActiveApp(): Promise<void> {
  if (AppState.currentState === 'active') {
    // foreground 전환 직후에는 AppState와 키체인 잠금 해제가 짧게 엇갈릴 수 있다.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return;
  }

  await new Promise<void>((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      subscription.remove();
      setTimeout(resolve, 100);
    });
  });
}

async function accessSecureStore<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isKeychainInteractionUnavailable(error)) throw error;

    // 잠긴 백그라운드에서 null로 대체하면 정상 세션을 로그아웃으로 오인한다.
    // 앱이 다시 활성화된 뒤 같은 작업을 한 번만 재시도한다.
    await waitForActiveApp();
    return operation();
  }
}

function getSecureItem(key: string): Promise<string | null> {
  return accessSecureStore(() => SecureStore.getItemAsync(key));
}

function setSecureItem(key: string, value: string): Promise<void> {
  return accessSecureStore(() => SecureStore.setItemAsync(key, value));
}

function deleteSecureItem(key: string): Promise<void> {
  return accessSecureStore(() => SecureStore.deleteItemAsync(key));
}

function getUtf8ByteLength(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let byteLength = 0;

  for (const character of value) {
    const characterBytes = getUtf8ByteLength(character);
    if (byteLength + characterBytes > CHUNK_SIZE_BYTES && chunk) {
      chunks.push(chunk);
      chunk = '';
      byteLength = 0;
    }
    chunk += character;
    byteLength += characterBytes;
  }

  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

function parseManifest(value: string | null): ChunkManifest | null {
  if (!value?.startsWith(MANIFEST_PREFIX)) return null;

  const parsed = JSON.parse(value.slice(MANIFEST_PREFIX.length)) as Partial<ChunkManifest>;
  if (
    typeof parsed.generation !== 'string' ||
    !Number.isInteger(parsed.count) ||
    (parsed.count ?? 0) < 1
  ) {
    throw new Error('인증 저장소 메타데이터가 올바르지 않습니다.');
  }

  return parsed as ChunkManifest;
}

function getChunkKey(key: string, generation: string, index: number): string {
  return `${key}.${generation}.${index}`;
}

async function removeChunks(key: string, manifest: ChunkManifest | null): Promise<void> {
  if (!manifest) return;

  await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      deleteSecureItem(getChunkKey(key, manifest.generation, index)),
    ),
  );
}

async function readSecureValue(key: string, storedValue: string): Promise<string> {
  const manifest = parseManifest(storedValue);
  if (!manifest) return storedValue;

  const chunks = await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      getSecureItem(getChunkKey(key, manifest.generation, index)),
    ),
  );
  if (chunks.some((chunk) => chunk === null)) {
    throw new Error('인증 저장소 일부를 불러오지 못했습니다.');
  }
  return chunks.join('');
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  const previousStoredValue = await getSecureItem(key);
  const previousManifest = parseManifest(previousStoredValue);
  const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const chunks = splitIntoChunks(value);
  const manifest: ChunkManifest = { generation, count: chunks.length };

  try {
    await Promise.all(
      chunks.map((chunk, index) =>
        setSecureItem(getChunkKey(key, generation, index), chunk),
      ),
    );
    await setSecureItem(key, `${MANIFEST_PREFIX}${JSON.stringify(manifest)}`);
  } catch (error) {
    await removeChunks(key, manifest);
    throw error;
  }

  await removeChunks(key, previousManifest);
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);

    const storedValue = await getSecureItem(key);
    const legacyValue = await AsyncStorage.getItem(key);

    if (storedValue !== null) {
      if (legacyValue !== null) pendingLegacyKeys.add(key);
      try {
        return await readSecureValue(key, storedValue);
      } catch (error) {
        if (legacyValue === null) throw error;
      }
    }

    if (legacyValue === null) return null;

    await writeSecureValue(key, legacyValue);
    pendingLegacyKeys.add(key);
    return legacyValue;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await writeSecureValue(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }

    const storedValue = await getSecureItem(key);
    await deleteSecureItem(key);
    await removeChunks(key, parseManifest(storedValue));
    await AsyncStorage.removeItem(key);
    pendingLegacyKeys.delete(key);
  },
};

export async function confirmAuthStorageMigration(): Promise<void> {
  const keys = [...pendingLegacyKeys];
  await Promise.all(
    keys.map(async (key) => {
      try {
        await AsyncStorage.removeItem(key);
        pendingLegacyKeys.delete(key);
      } catch {
        // 다음 앱 실행에서 다시 정리한다.
      }
    }),
  );
}
