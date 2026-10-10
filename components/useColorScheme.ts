import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useThemeStore } from '@/stores/useThemeStore';

export function useColorScheme() {
  const systemScheme = useSystemColorScheme();
  const mode = useThemeStore((s) => s.mode);

  if (mode === 'light' || mode === 'dark') return mode;
  // RN의 unspecified/null은 앱에서 지원하는 기본 밝은 테마로 정규화한다.
  return systemScheme === 'dark' ? 'dark' : 'light';
}
