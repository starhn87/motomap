import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Place } from '@/types';

// 검색에서 선택한 장소·코스 최근 5개 (최신순). 실패는 조용히 무시 — 검색 자체를 막지 않는다.
const KEY = 'recent-searches';
const MAX = 5;

export type RecentSearch =
  | { type: 'place'; place: Place }
  | { type: 'course'; id: string; name: string };

export function recentKey(entry: RecentSearch): string {
  return entry.type === 'place' ? `place-${entry.place.id}` : `course-${entry.id}`;
}

export async function loadRecentSearches(): Promise<RecentSearch[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(entry: RecentSearch): Promise<RecentSearch[]> {
  const current = await loadRecentSearches();
  const next = [entry, ...current.filter((e) => recentKey(e) !== recentKey(entry))].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장 실패해도 반환값으로 UI는 갱신된다
  }
  return next;
}

export async function removeRecentSearch(key: string): Promise<RecentSearch[]> {
  const next = (await loadRecentSearches()).filter((e) => recentKey(e) !== key);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 무시
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
