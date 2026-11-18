import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Portal, PortalHost } from '@gorhom/portal';

const HOST = 'map-overlays';

// 탭과 지도 크기는 유지하고 시트만 일반 루트 뷰의 앞쪽에서 그린다.
export function MapOverlayHost() {
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}>
    <PortalHost name={HOST} />
  </View>;
}

export default function MapOverlayLayer({ focused, inline = false, children }: {
  focused: boolean;
  inline?: boolean;
  children: ReactNode;
}) {
  const layer = (
    <View collapsable={false} pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { display: focused ? 'flex' : 'none' }, inline && styles.stackLayer]}>
      {children}
    </View>
  );
  // 스택 지도는 탭을 덮을 필요가 없고 Android에서 루트 포털이 스택 뒤에 가려질 수 있다.
  return inline ? layer : <Portal hostName={HOST}>{layer}</Portal>;
}

const styles = StyleSheet.create({ stackLayer: { zIndex: 100, elevation: 100 } });
