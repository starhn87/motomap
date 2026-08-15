import { getCurrentUser, requireUser } from '@/lib/auth';
import { rowToCourse } from '@/lib/api/courses';
import { supabase } from '@/lib/supabase';
import type { RidingCourse } from '@/types';

export interface CourseProgress {
  saved: boolean;
  completionCount: number;
  lastCompletedAt: string | null;
}

export interface CourseLibraryItem extends CourseProgress {
  course: RidingCourse;
  savedAt: string | null;
}

export async function fetchCourseProgress(courseId: string): Promise<CourseProgress> {
  const user = await getCurrentUser();
  if (!user) return { saved: false, completionCount: 0, lastCompletedAt: null };

  const [saveResult, completionResult] = await Promise.all([
    supabase
      .from('course_saves')
      .select('course_id')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle(),
    supabase
      .from('course_completions')
      .select('completed_at')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .order('completed_at', { ascending: false }),
  ]);
  if (saveResult.error) throw saveResult.error;
  if (completionResult.error) throw completionResult.error;
  return {
    saved: !!saveResult.data,
    completionCount: completionResult.data?.length ?? 0,
    lastCompletedAt: completionResult.data?.[0]?.completed_at ?? null,
  };
}

export async function toggleCourseSave(courseId: string): Promise<boolean> {
  const user = await requireUser();
  const { data: existing, error: selectError } = await supabase
    .from('course_saves')
    .select('course_id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from('course_saves')
      .delete()
      .eq('user_id', user.id)
      .eq('course_id', courseId);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from('course_saves')
    .insert({ user_id: user.id, course_id: courseId });
  if (error) throw error;
  return true;
}

/** 실제 코스 안내가 도착지 근처에서 끝난 경우만 호출한다. true면 새 완주 기록. */
export async function recordCourseCompletion(courseId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('record_course_completion', {
    p_course_id: courseId,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchCourseLibrary(): Promise<CourseLibraryItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const [savesResult, completionsResult] = await Promise.all([
    supabase
      .from('course_saves')
      .select('created_at, course_id, courses(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('course_completions')
      .select('completed_at, course_id, courses(*)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false }),
  ]);
  if (savesResult.error) throw savesResult.error;
  if (completionsResult.error) throw completionsResult.error;

  const library = new Map<string, CourseLibraryItem>();
  for (const row of savesResult.data ?? []) {
    if (!row.courses) continue;
    library.set(row.course_id, {
      course: rowToCourse(row.courses),
      saved: true,
      savedAt: row.created_at,
      completionCount: 0,
      lastCompletedAt: null,
    });
  }
  for (const row of completionsResult.data ?? []) {
    if (!row.courses) continue;
    const current = library.get(row.course_id) ?? {
      course: rowToCourse(row.courses),
      saved: false,
      savedAt: null,
      completionCount: 0,
      lastCompletedAt: null,
    };
    current.completionCount += 1;
    current.lastCompletedAt ??= row.completed_at;
    library.set(row.course_id, current);
  }
  return [...library.values()].sort((a, b) =>
    (b.lastCompletedAt ?? b.savedAt ?? '').localeCompare(a.lastCompletedAt ?? a.savedAt ?? ''),
  );
}
