import { useQuery } from '@tanstack/react-query';

import { fetchCourses, fetchCourseById } from '@/lib/api/courses';

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => fetchCourses(),
  });
}

export function useCourse(id: string | null) {
  return useQuery({
    queryKey: ['courses', 'detail', id],
    queryFn: () => fetchCourseById(id!),
    enabled: !!id,
  });
}
