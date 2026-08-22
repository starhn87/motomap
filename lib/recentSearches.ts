import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Place } from '@/types';
import type { NavTarget } from '@/lib/navigation';

// 검색에서 선택한 장소·코스 최근 5개 (최신순). 실패는 조용히 무시 — 검색 자체를 막지 않는다.
const KEY = 'recent-searches';
const MAX = 5;

export type RecentSearch =
  | { type: 'place'; place: Place }
  | { type: 'course'; id: string; name: string }
  | {
      type: 'kakao';
      name: string;
      address: string;
      latitude: number;
      longitude: number;
      phone?: string;
      providerId?: string;
      placeUrl?: string;
    };

export function recentKey(entry: RecentSearch): string {
  if (entry.type === 'place') return `place-${entry.place.id}`;
  if (entry.type === 'course') return `course-${entry.id}`;
  return `kakao-${entry.latitude},${entry.longitude}`;
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

// 승격 등으로 목록을 통째로 바꿀 때 사용
export async function saveRecentSearches(list: RecentSearch[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 무시
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

// 좌표가 있는 최근 검색만 길찾기 지점이 될 수 있다 (코스는 제외)
function recentAsTarget(entry: RecentSearch): (NavTarget & { address?: string }) | null {
  if (entry.type === 'place') {
    return {
      name: entry.place.name,
      latitude: entry.place.latitude,
      longitude: entry.place.longitude,
      placeId: entry.place.id,
      address: entry.place.address,
    };
  }
  if (entry.type === 'kakao') {
    return {
      name: entry.name,
      latitude: entry.latitude,
      longitude: entry.longitude,
      address: entry.address,
    };
  }
  return null;
}

// 길찾기·미리보기의 지점 검색이 함께 쓰는 최근 검색 지점 목록.
// 같은 장소가 등록 장소(place)와 카카오 검색(kakao) 두 형태로 쌓일 수 있어
// 이름+좌표(±10m)로 합친다 — 먼저 온(최신) 항목이 남는다.
export function recentTargets(
  entries: RecentSearch[],
): { entry: RecentSearch; target: NavTarget & { address?: string } }[] {
  const seen = new Set<string>();
  const out: { entry: RecentSearch; target: NavTarget & { address?: string } }[] = [];
  for (const entry of entries) {
    const target = recentAsTarget(entry);
    if (!target) continue;
    const key = `${target.name}|${target.latitude.toFixed(4)},${target.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ entry, target });
  }
  return out;
}
