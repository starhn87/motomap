import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type RidingGuideProposalStatus =
  | 'pending'
  | 'editing'
  | 'published'
  | 'merged'
  | 'rejected';

export interface RidingGuideProposalStopInput {
  role: 'primary' | 'stop';
  placeId?: string;
  generalPlaceId?: string;
  note?: string;
}

export interface RidingGuideProposalInput {
  title?: string;
  reason: string;
  featuredRoads: string[];
  tags: string[];
  stops: RidingGuideProposalStopInput[];
}

export interface MyRidingGuideProposal {
  id: string;
  title: string | null;
  reason: string;
  status: RidingGuideProposalStatus;
  resultGuideId: string | null;
  rejectedReason: string | null;
  destinationName: string;
  createdAt: string;
}

function uniqueTrimmed(values: string[], limit: number, maxLength: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .map((value) => value.slice(0, maxLength))
    .slice(0, limit);
}

export async function submitRidingGuideProposal(
  input: RidingGuideProposalInput,
): Promise<string> {
  const stops = input.stops.map((stop, position) => ({
    position,
    role: stop.role,
    place_id: stop.placeId ?? null,
    general_place_id: stop.generalPlaceId ?? null,
    note: stop.note?.trim() || null,
  }));

  const { data, error } = await supabase.rpc('submit_riding_guide_proposal', {
    p_title: input.title?.trim() || null,
    p_reason: input.reason.trim(),
    p_featured_roads: uniqueTrimmed(input.featuredRoads, 8, 200),
    p_tags: uniqueTrimmed(input.tags, 12, 30),
    p_stops: stops,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('제안 번호를 확인하지 못했습니다.');
  return data;
}

export async function fetchMyRidingGuideProposals(): Promise<MyRidingGuideProposal[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: submissions, error: submissionsError } = await supabase
    .from('riding_guide_submissions')
    .select('id, title, reason, status, result_guide_id, rejected_reason, created_at')
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false });
  if (submissionsError) throw submissionsError;
  if (!submissions?.length) return [];

  const submissionIds = submissions.map((submission: any) => submission.id as string);
  const { data: primaryStops, error: stopsError } = await supabase
    .from('riding_guide_submission_stops')
    .select('submission_id, place_id, general_place_id')
    .in('submission_id', submissionIds)
    .eq('role', 'primary');
  if (stopsError) throw stopsError;

  const placeIds = (primaryStops ?? [])
    .map((stop: any) => stop.place_id as string | null)
    .filter((id): id is string => !!id);
  const generalPlaceIds = (primaryStops ?? [])
    .map((stop: any) => stop.general_place_id as string | null)
    .filter((id): id is string => !!id);

  const [placesResult, generalPlacesResult] = await Promise.all([
    placeIds.length
      ? supabase.from('places').select('id, name').in('id', placeIds)
      : Promise.resolve({ data: [], error: null }),
    generalPlaceIds.length
      ? supabase.from('general_places').select('id, name').in('id', generalPlaceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (placesResult.error) throw placesResult.error;
  if (generalPlacesResult.error) throw generalPlacesResult.error;

  const placeNames = new Map<string, string>(
    (placesResult.data ?? []).map((place: any) => [place.id, place.name]),
  );
  const generalPlaceNames = new Map<string, string>(
    (generalPlacesResult.data ?? []).map((place: any) => [place.id, place.name]),
  );
  const primaryBySubmission = new Map<string, string>();
  for (const stop of primaryStops ?? []) {
    const name = stop.place_id
      ? placeNames.get(stop.place_id)
      : generalPlaceNames.get(stop.general_place_id);
    if (name) primaryBySubmission.set(stop.submission_id, name);
  }

  return submissions.map((submission: any) => ({
    id: submission.id,
    title: submission.title,
    reason: submission.reason,
    status: submission.status as RidingGuideProposalStatus,
    resultGuideId: submission.result_guide_id,
    rejectedReason: submission.rejected_reason,
    destinationName: primaryBySubmission.get(submission.id) ?? '대표 목적지',
    createdAt: submission.created_at,
  }));
}
