import { supabase } from '@/lib/supabase';
import { fetchAllPlaces } from '@/lib/api/places';
import {
  GENERAL_PLACE_SELECT,
  rowToGeneralPlace,
  type GeneralPlaceRow,
} from '@/lib/api/generalPlaces';
import type {
  Place,
  RidingGuide,
  RidingGuidePlace,
  RidingGuideStop,
} from '@/types';

type RidingGuideStopRow = {
  id: string;
  position: number;
  role: 'primary' | 'stop';
  place_id: string | null;
  general_place_id: string | null;
  note: string | null;
};

type RidingGuideRow = {
  id: string;
  title: string;
  summary: string;
  description: string;
  featured_roads: string[] | null;
  regions: string[] | null;
  tags: string[] | null;
  cover_image_url: string | null;
  legacy_course_id: string | null;
  published_at: string;
  created_at: string;
  riding_guide_stops: RidingGuideStopRow[] | null;
};

const RIDING_GUIDE_SELECT = `
  id,
  title,
  summary,
  description,
  featured_roads,
  regions,
  tags,
  cover_image_url,
  legacy_course_id,
  published_at,
  created_at,
  riding_guide_stops (
    id,
    position,
    role,
    place_id,
    general_place_id,
    note
  )
`;

function registeredTarget(place: Place): RidingGuidePlace {
  return {
    id: place.id,
    source: 'registered',
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    category: place.category,
    photos: place.photos,
    phone: place.phone,
  };
}

async function resolveRows(rows: RidingGuideRow[]): Promise<RidingGuide[]> {
  if (rows.length === 0) return [];

  const stopRows = rows.flatMap((row) => row.riding_guide_stops ?? []);
  const generalIds = [
    ...new Set(
      stopRows.flatMap((stop) =>
        stop.general_place_id ? [stop.general_place_id] : [],
      ),
    ),
  ];

  const [registeredPlaces, generalResult] = await Promise.all([
    fetchAllPlaces(null),
    generalIds.length > 0
      ? supabase
          .from('general_places')
          .select(GENERAL_PLACE_SELECT)
          .in('id', generalIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (generalResult.error) throw generalResult.error;

  const registeredById = new Map(registeredPlaces.map((place) => [place.id, place]));
  const generalById = new Map(
    ((generalResult.data ?? []) as GeneralPlaceRow[]).map((row) => {
      const place = rowToGeneralPlace(row);
      return [place.id, place] as const;
    }),
  );

  return rows.flatMap((row) => {
    const stops = (row.riding_guide_stops ?? [])
      .sort((a, b) => a.position - b.position)
      .flatMap((stop): RidingGuideStop[] => {
        if (stop.place_id) {
          const place = registeredById.get(stop.place_id);
          if (!place) return [];
          return [{
            id: stop.id,
            position: stop.position,
            role: stop.role,
            note: stop.note ?? undefined,
            placeId: stop.place_id,
            place: registeredTarget(place),
          }];
        }

        if (!stop.general_place_id) return [];
        const general = generalById.get(stop.general_place_id);
        if (!general) return [];

        // 일반 장소가 등록 장소로 승격되면 새 상세를 바로 사용한다. 원본
        // generalPlaceId는 남겨 콘텐츠 연결 이력을 보존한다.
        if (general.promotedPlaceId) {
          const promoted = registeredById.get(general.promotedPlaceId);
          if (promoted) {
            return [{
              id: stop.id,
              position: stop.position,
              role: stop.role,
              note: stop.note ?? undefined,
              generalPlaceId: stop.general_place_id,
              place: registeredTarget(promoted),
            }];
          }
        }

        return [{
          id: stop.id,
          position: stop.position,
          role: stop.role,
          note: stop.note ?? undefined,
          generalPlaceId: stop.general_place_id,
          place: {
            id: general.id,
            source: 'general',
            name: general.name,
            address: general.address,
            latitude: general.latitude,
            longitude: general.longitude,
            photos: [],
            phone: general.phone,
            providerId: general.provider === 'kakao' ? general.providerId : undefined,
            placeUrl: general.placeUrl,
          },
        }];
      });

    // 공개 가이드는 대표 목적지가 있어야 완성된다. 장소가 숨김 처리돼
    // 연결을 해석하지 못하면 잘못된 카드 대신 운영 검토 대상으로 제외한다.
    if (!stops.some((stop) => stop.role === 'primary')) return [];

    return [{
      id: row.id,
      title: row.title,
      summary: row.summary,
      description: row.description,
      featuredRoads: row.featured_roads ?? [],
      regions: row.regions ?? [],
      tags: row.tags ?? [],
      coverImageUrl: row.cover_image_url ?? undefined,
      legacyCourseId: row.legacy_course_id ?? undefined,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      stops,
    }];
  });
}

export async function fetchRidingGuides(): Promise<RidingGuide[]> {
  const { data, error } = await supabase
    .from('riding_guides')
    .select(RIDING_GUIDE_SELECT)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return resolveRows((data ?? []) as unknown as RidingGuideRow[]);
}

export async function fetchRidingGuideById(id: string): Promise<RidingGuide | null> {
  const { data, error } = await supabase
    .from('riding_guides')
    .select(RIDING_GUIDE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [guide] = await resolveRows([data as unknown as RidingGuideRow]);
  return guide ?? null;
}

export async function fetchRidingGuideIdByLegacyCourseId(
  courseId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('riding_guides')
    .select('id')
    .eq('legacy_course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
