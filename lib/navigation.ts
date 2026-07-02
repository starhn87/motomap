import { Alert, Linking } from 'react-native';
import KakaoNavi from '@react-native-kakao/navi';

import { useNavPrefStore, type NavAppId } from '@/stores/useNavPrefStore';
import { toast } from '@/lib/toast';

export interface NavTarget {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NavApp {
  id: NavAppId;
  label: string;
  scheme: string;
  launch: (target: NavTarget) => Promise<void>;
}

export const NAV_APPS: NavApp[] = [
  {
    id: 'kakaonavi',
    label: '카카오내비 (이륜차)',
    scheme: 'kakaonavi-sdk://',
    launch: async ({ name, latitude, longitude }) => {
      await KakaoNavi.navigateTo({
        destination: { name, x: longitude, y: latitude },
        option: { coordType: 'WGS84', vehicleType: 'TwoWheel' },
      });
    },
  },
  {
    id: 'tmap',
    label: 'T맵 (이륜차)',
    scheme: 'tmap://',
    launch: async ({ name, latitude, longitude }) => {
      await Linking.openURL(
        `tmap://route?goalname=${encodeURIComponent(name)}&goaly=${latitude}&goalx=${longitude}&carType=8`,
      );
    },
  },
  {
    id: 'kakaomap',
    label: '카카오맵',
    scheme: 'kakaomap://',
    launch: async ({ name, latitude, longitude }) => {
      await Linking.openURL(
        `kakaomap://route?ep=${latitude},${longitude}&by=CAR&ename=${encodeURIComponent(name)}`,
      );
    },
  },
  {
    id: 'nmap',
    label: '네이버지도',
    scheme: 'nmap://',
    launch: async ({ name, latitude, longitude }) => {
      await Linking.openURL(
        `nmap://route/car?dlat=${latitude}&dlng=${longitude}&dname=${encodeURIComponent(name)}&appname=com.ridemap.app`,
      );
    },
  },
  {
    id: 'apple',
    label: 'Apple 지도',
    scheme: 'maps://',
    launch: async ({ latitude, longitude }) => {
      await Linking.openURL(`maps://?daddr=${latitude},${longitude}&dirflg=d`);
    },
  },
];

export async function getAvailableNavApps(): Promise<NavApp[]> {
  const results = await Promise.all(
    NAV_APPS.map(async (app) => {
      const canOpen = await Linking.canOpenURL(app.scheme).catch(() => false);
      return canOpen ? app : null;
    }),
  );
  return results.filter((app): app is NavApp => app !== null);
}

export async function openNavigation(target: NavTarget) {
  const available = await getAvailableNavApps();

  if (available.length === 0) {
    toast.info('설치된 네비게이션 앱이 없습니다.');
    return;
  }

  // 딥링크 실행 실패(앱 구버전·미로그인·스킴 처리 실패 등 — canOpenURL 은 통과해도
  // 실제 실행은 실패할 수 있다)를 삼키지 않고 안내한다. 잡지 않으면 unhandled
  // promise rejection 으로 새어 나가 Sentry 에 노이즈가 쌓인다.
  const launch = async (app: NavApp) => {
    try {
      await app.launch(target);
    } catch {
      toast.error('네비게이션 앱을 열 수 없습니다.', `${app.label} 실행에 실패했습니다.`);
    }
  };

  const { defaultApp } = useNavPrefStore.getState();
  if (defaultApp) {
    const preferred = available.find((app) => app.id === defaultApp);
    if (preferred) {
      await launch(preferred);
      return;
    }
  }

  if (available.length === 1) {
    await launch(available[0]);
    return;
  }

  Alert.alert('네비게이션 선택', '어떤 앱으로 안내할까요?', [
    ...available.map((app) => ({
      text: app.label,
      onPress: () => {
        void launch(app);
      },
    })),
    { text: '취소', style: 'cancel' as const },
  ]);
}
