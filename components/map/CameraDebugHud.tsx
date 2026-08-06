import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';

import { subscribeCamLog } from '@/lib/camDebug';

// 임시 진단 HUD — 최근 카메라 명령의 출처와 적용 중인 OTA id 를 지도 위에
// 띄운다. "검색 복귀 때 내 위치가 잠깐 보인다"의 범인을 실기기에서 읽기 위한
// 것으로, 원인이 확정되면 이 컴포넌트째 제거한다.
export default function CameraDebugHud() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    subscribeCamLog(setLines);
    return () => subscribeCamLog(null);
  }, []);

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.line}>ota {Updates.updateId?.slice(0, 8) ?? 'embedded'}</Text>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 8,
    bottom: 140,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: 99,
    elevation: 99,
  },
  line: {
    color: '#4ADE80',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
