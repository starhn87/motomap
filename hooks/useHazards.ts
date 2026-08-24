import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchNearbyHazards,
  fetchHazardsNearCourse,
  submitHazard,
  voteHazard,
} from '@/lib/api/hazards';
import { mapRenderWindowRadius, type MapCenter } from '@/hooks/usePlaces';
import { HAZARD_MIN_ZOOM } from '@/constants/hazards';

const DEFAULT_HAZARD_RADIUS_M = 20_000;
const MIN_HAZARD_RADIUS_M = 5_000;
const MAX_HAZARD_RADIUS_M = 50_000;

// 지도에 띄울 주변 노면 위험. 마이그레이션 025 배포 전이거나 실패해도
// 마커만 안 보이면 되므로 조용히 빈 목록으로 처리한다.
export function useNearbyHazards(center?: MapCenter | null) {
  const lat = center ? Number(center.latitude.toFixed(2)) : null;
  const lng = center ? Number(center.longitude.toFixed(2)) : null;
  const renderRadius = center ? mapRenderWindowRadius(center) : null;
  // 렌더 창의 모서리와 중심 좌표 반올림 오차를 덮는다. km 단위로 스냅해
  // 작은 region 변화가 같은 RPC를 반복 호출하지 않게 한다.
  const radius = Math.min(
    MAX_HAZARD_RADIUS_M,
    Math.max(
      MIN_HAZARD_RADIUS_M,
      Math.round(((renderRadius ?? DEFAULT_HAZARD_RADIUS_M) * 1.3) / 1_000) * 1_000,
    ),
  );
  const enabled = lat !== null && lng !== null && (center?.zoom ?? 0) >= HAZARD_MIN_ZOOM;

  return useQuery({
    queryKey: ['hazards', lat, lng, radius],
    queryFn: async () => {
      try {
        return await fetchNearbyHazards(lat!, lng!, radius);
      } catch {
        return [];
      }
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useCourseHazards(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-hazards', courseId],
    queryFn: async () => {
      try {
        return await fetchHazardsNearCourse(courseId!);
      } catch {
        return [];
      }
    },
    enabled: !!courseId,
  });
}

export function useSubmitHazard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitHazard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] });
      queryClient.invalidateQueries({ queryKey: ['course-hazards'] });
    },
  });
}

export function useVoteHazard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'confirm' | 'resolve' }) =>
      voteHazard(id, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hazards'] });
      queryClient.invalidateQueries({ queryKey: ['course-hazards'] });
    },
  });
}
