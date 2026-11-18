import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native';

/** 기존 chevron 글리프의 오른쪽 여백 치우침만 광학 보정한다. */
export default function BackIcon({ size = 26, color }: { size?: number; color: string }) {
  return <Ionicons name="chevron-back" size={size} color={color} style={styles.icon} />;
}

const styles = StyleSheet.create({ icon: { transform: [{ translateX: -1.5 }] } });
