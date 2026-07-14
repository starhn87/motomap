import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 탭바는 아이콘을 활성/비활성 두 벌로 겹쳐 렌더해 focused prop 이 인스턴스별로 고정이다.
// 그래서 focused 변화 감지 대신 tabPress 이벤트로 스프링을 트리거한다 — 사용자가
// 실제로 눌렀을 때만 동작하고, 앱 시작 시 초기 탭에서는 아무 효과도 없다.
function useTabPressScale() {
  const scale = useSharedValue(1);
  const trigger = () => {
    scale.value = 0.8;
    scale.value = withSpring(1, { damping: 11, stiffness: 320 });
  };
  return { scale, trigger };
}

function TabBarIcon({
  name,
  color,
  scale,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  scale: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <FontAwesome size={24} name={name} color={color} />
    </Animated.View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const mapTab = useTabPressScale();
  const coursesTab = useTabPressScale();
  const submitTab = useTabPressScale();
  const profileTab = useTabPressScale();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          // 상단 여백을 주는 만큼 높이도 늘려야 라벨이 잘리지 않는다
          paddingTop: 6,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: {
          marginTop: 4,
        },
        headerStyle: {
          backgroundColor: colors.surfaceElevated,
        },
        headerTintColor: colors.text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '지도',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="map" color={color} scale={mapTab.scale} />
          ),
        }}
        listeners={{ tabPress: mapTab.trigger }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: '탐색',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="compass" color={color} scale={coursesTab.scale} />
          ),
        }}
        listeners={{ tabPress: coursesTab.trigger }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: '제보',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="plus-circle" color={color} scale={submitTab.scale} />
          ),
        }}
        listeners={{ tabPress: submitTab.trigger }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="user" color={color} scale={profileTab.scale} />
          ),
        }}
        listeners={{ tabPress: profileTab.trigger }}
      />
    </Tabs>
  );
}
