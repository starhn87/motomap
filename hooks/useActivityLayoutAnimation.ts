import { LayoutAnimation } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export function useActivityLayoutAnimation() {
  const reduceMotion = useReducedMotion();
  return () => {
    if (reduceMotion) return;
    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
  };
}
