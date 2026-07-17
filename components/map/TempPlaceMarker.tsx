import { View, StyleSheet } from 'react-native';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';

interface Props {
  latitude: number;
  longitude: number;
}

// 일반 장소(임시 목적지) 핀 — 연속 곡면의 물방울(부채꼴) 실루엣.
// "모서리 셋만 둥근 사각형을 45도 회전"이 물방울의 본체다. 단일 View 라 흰 border 가
// 실루엣 전체를 그대로 감싼다. 정사각 회전은 폭=높이로 뚱뚱해지므로 바깥 컨테이너에
// scaleX/scaleY 를 걸어 갸름하게 만든다 (깃발 치수는 왜곡을 미리 보정).
// 마커 children 은 정적 비트맵 캡처: 이모지 유실·뷰 플래트닝 대비 전부 collapsable={false}.
const PIN = '#475569';
const SIDE = 30; // 회전 전 사각형 한 변 (대각선 = 42.4)
const WRAP_W = 38;
const WRAP_H = 48;

export default function TempPlaceMarker({ latitude, longitude }: Props) {
  return (
    <NaverMapMarkerOverlay
      latitude={latitude}
      longitude={longitude}
      anchor={{ x: 0.5, y: 1 }}
      width={WRAP_W}
      height={WRAP_H}
      zIndex={2000}>
      <View collapsable={false} style={styles.wrap}>
        <View collapsable={false} style={styles.squeeze}>
          <View collapsable={false} style={styles.drop}>
            <View collapsable={false} style={styles.inner}>
              <View collapsable={false} style={styles.flagRow}>
                <View collapsable={false} style={styles.flagPole} />
                <View collapsable={false} style={styles.flagFace} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </NaverMapMarkerOverlay>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: WRAP_W,
    height: WRAP_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 갸름한 비율: 가로 0.82배, 세로 1.08배
  squeeze: {
    transform: [{ scaleX: 0.82 }, { scaleY: 1.08 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  drop: {
    width: SIDE,
    height: SIDE,
    backgroundColor: PIN,
    borderTopLeftRadius: SIDE / 2,
    borderTopRightRadius: SIDE / 2,
    borderBottomLeftRadius: SIDE / 2,
    borderBottomRightRadius: 5,
    transform: [{ rotate: '45deg' }],
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  inner: {
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // squeeze 의 가로 압축을 상쇄해 깃발이 눌려 보이지 않게 살짝 넓힌 치수를 쓴다
  },
  flagPole: {
    width: 2.5,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  flagFace: {
    width: 8.5,
    height: 6,
    marginTop: 1,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
});
