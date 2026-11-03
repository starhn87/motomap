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

export default function MapOverlayLayer({ focused, children }: { focused: boolean; children: ReactNode }) {
  return <Portal hostName={HOST}>
    <View collapsable={false} pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { display: focused ? 'flex' : 'none' }]}>
      {children}
    </View>
  </Portal>;
}
