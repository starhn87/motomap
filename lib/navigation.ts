import { Alert, Linking } from 'react-native';
import KakaoNavi from '@react-native-kakao/navi';

import { useNavPrefStore, type NavAppId } from '@/stores/useNavPrefStore';
import { useMapStore } from '@/stores/useMapStore';
import { coordToAddress } from '@/lib/api/kakaoLocal';
import { checkRouteWeather } from '@/lib/api/weather';
import { toast } from '@/lib/toast';

export interface NavTarget {
  name: string;
  latitude: number;
  longitude: number;
}

/** 코스 내비 대상 — points 는 코스 순서(출발지 → 경유지들 → 도착지) */
export interface NavCourse {
  name: string;
  points: { latitude: number; longitude: number; name?: string }[];
}

export interface NavApp {
  id: NavAppId;
  label: string;
  scheme: string;
  launch: (target: NavTarget) => Promise<void>;
  /** 경유지 지원 앱만 구현 — 없으면 코스 출발지로 안내(fallback) */
  launchCourse?: (course: NavCourse) => Promise<void>;
}

// 경유지 상한(앱별)에 맞춰 추림 — 코스 출발지(첫 점)는 보존하고 나머지를 고르게 선택
function sampleWaypoints<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const [first, ...rest] = points;
  const picked = [first];
  for (let i = 0; i < max - 1; i++) {
    picked.push(rest[Math.round(((i + 1) * rest.length) / (max - 1)) - 1]);
  }
  return picked;
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
    // 출발지는 현재 위치(SDK 기본), 경유지 최대 3개
    launchCourse: async ({ name, points }) => {
      const dest = points[points.length - 1];
      const vias = sampleWaypoints(points.slice(0, -1), 3);
      await KakaoNavi.navigateTo({
        destination: {
          name: dest.name ?? `${name} 도착지`,
          x: dest.longitude,
          y: dest.latitude,
        },
        viaList: vias.map((p, i) => ({
          name: p.name ?? (i === 0 ? '코스 출발지' : `경유지 ${i}`),
          x: p.longitude,
          y: p.latitude,
        })),
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
    // 출발지는 현재 위치(파라미터 생략 시 기본), 경유지 v1~v5 최대 5개
    launchCourse: async ({ name, points }) => {
      const dest = points[points.length - 1];
      const vias = sampleWaypoints(points.slice(0, -1), 5);
      const viaParams = vias
        .map(
          (p, i) =>
            `&v${i + 1}lat=${p.latitude}&v${i + 1}lng=${p.longitude}&v${i + 1}name=${encodeURIComponent(
              p.name ?? (i === 0 ? '코스 출발지' : `경유지 ${i}`),
            )}`,
        )
        .join('');
      await Linking.openURL(
        `nmap://route/car?dlat=${dest.latitude}&dlng=${dest.longitude}&dname=${encodeURIComponent(dest.name ?? `${name} 도착지`)}${viaParams}&appname=com.ridemap.app`,
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

// 앱 선택 흐름(기본앱 → 단일 → 선택 Alert) 공통화.
// 딥링크 실행 실패(앱 구버전·미로그인·스킴 처리 실패 등 — canOpenURL 은 통과해도
// 실제 실행은 실패할 수 있다)를 삼키지 않고 안내한다. 잡지 않으면 unhandled
// promise rejection 으로 새어 나가 Sentry 에 노이즈가 쌓인다.
async function withNavApp(run: (app: NavApp) => Promise<void>) {
  const available = await getAvailableNavApps();

  if (available.length === 0) {
    toast.info('설치된 네비게이션 앱이 없습니다.');
    return;
  }

  const tryRun = async (app: NavApp) => {
    try {
      await run(app);
    } catch {
      toast.error('네비게이션 앱을 열 수 없습니다.', `${app.label} 실행에 실패했습니다.`);
    }
  };

  const { defaultApp } = useNavPrefStore.getState();
  if (defaultApp) {
    const preferred = available.find((app) => app.id === defaultApp);
    if (preferred) {
      await tryRun(preferred);
      return;
    }
  }

  if (available.length === 1) {
    await tryRun(available[0]);
    return;
  }

  Alert.alert('네비게이션 선택', '어떤 앱으로 안내할까요?', [
    ...available.map((app) => ({
      text: app.label,
      onPress: () => {
        void tryRun(app);
      },
    })),
    { text: '취소', style: 'cancel' as const },
  ]);
}

// 내비 출발 전 경로 지점들의 날씨를 확인하고, 비·눈·뇌우가 있으면 출발 여부를 묻는다.
// 취소하면 false. 날씨가 좋거나 확인에 실패하면 조용히 true (출발을 막지 않는다).
async function confirmRouteWeather(
  points: { latitude: number; longitude: number }[],
): Promise<boolean> {
  const userLocation = useMapStore.getState().userLocation;
  const allPoints = userLocation ? [userLocation, ...points] : points;
  const warning = await checkRouteWeather(allPoints);
  if (!warning) return true;

  const popText = warning.maxPop > 0 ? ` (강수확률 최대 ${warning.maxPop}%)` : '';
  const where =
    warning.regions.length > 0
      ? warning.regions.join(', ')
      : `경로 위 ${warning.count}개 지점`;
  return new Promise((resolve) => {
    Alert.alert(
      '경로 날씨 주의',
      `${where}에 ${warning.worstCondition} 소식이 있어요${popText}. 노면이 미끄러울 수 있으니 주의하세요. 그래도 출발할까요?`,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '출발', onPress: () => resolve(true) },
      ],
    );
  });
}

// 내비 시작 연타 방지 — 날씨 확인이 끝나기 전에 다시 누르면 경고가 겹겹이 쌓인다
let navLaunchInFlight = false;

export async function openNavigation(target: NavTarget) {
  if (navLaunchInFlight) return;
  navLaunchInFlight = true;
  try {
    if (!(await confirmRouteWeather([target]))) return;
    await withNavApp((app) => app.launch(target));
  } finally {
    navLaunchInFlight = false;
  }
}

// 각 지점의 실제 주소를 역지오코딩으로 채운다 — 내비 화면에 "경유지 1" 같은
// 제네릭 라벨 대신 주소가 표시되게. 실패한 지점은 name 없이 두어 라벨 fallback.
async function resolvePointNames(course: NavCourse): Promise<NavCourse> {
  const named = await Promise.all(
    course.points.map(async (p) => {
      if (p.name) return p;
      const address = await coordToAddress(p.latitude, p.longitude);
      return address ? { ...p, name: address } : p;
    }),
  );
  return { ...course, points: named };
}

/**
 * 코스 전체 안내 — 출발지는 현재 위치(각 앱 기본), 경유지 지원 앱(카카오내비·네이버지도)은
 * 코스 출발지~중간 지점을 경유지로 넣고 코스 끝을 목적지로 안내한다.
 * 경유지 미지원 앱(T맵·카카오맵·Apple)은 코스 출발지로 안내 — 거기부터는 코스를 직접 탄다.
 */
export async function openCourseNavigation(course: NavCourse) {
  if (course.points.length === 0) return;
  if (navLaunchInFlight) return;
  navLaunchInFlight = true;
  try {
    await openCourseNavigationInner(course);
  } finally {
    navLaunchInFlight = false;
  }
}

async function openCourseNavigationInner(course: NavCourse) {
  if (!(await confirmRouteWeather(course.points))) return;
  await withNavApp(async (app) => {
    if (app.launchCourse && course.points.length >= 2) {
      return app.launchCourse(await resolvePointNames(course));
    }
    const start = course.points[0];
    const address = await coordToAddress(start.latitude, start.longitude);
    return app.launch({
      name: address ?? `${course.name} 출발지`,
      latitude: start.latitude,
      longitude: start.longitude,
    });
  });
}
