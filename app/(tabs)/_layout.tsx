import React from 'react';
import { Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

// 누르는 동안 움츠리고(pressIn) 떼는 순간 한 번만 튕기며 복귀(pressOut).
// tabPress 는 손을 뗀 뒤에야 발생해 이 구분이 불가능하므로 tabBarButton 을 커스텀해
// pressIn/pressOut 을 직접 잡는다. 스프링 물리식은 잔진동이 여러 번 남아서,
// 오버슛 1회가 보장되는 timing 시퀀스(0.82 → 1.06 → 1, 총 210ms)로 만든다.
function useTabPressScale() {
  const scale = useSharedValue(1);
  return {
    scale,
    pressIn: () => {
      scale.value = withTiming(0.82, { duration: 90 });
    },
    pressOut: () => {
      scale.value = withSequence(
        withTiming(1.06, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 100, easing: Easing.inOut(Easing.quad) }),
      );
    },
  };
}

type TabScale = ReturnType<typeof useTabPressScale>;

// 탭 버튼 — 시각 효과는 아이콘의 Animated.View 가 sharedValue 를 구독해 처리하고,
// 여기서는 제스처 시점만 sharedValue 에 흘려보낸다
function TabButton({ tab, props }: { tab: TabScale; props: BottomTabBarButtonProps }) {
  const { children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID } =
    props;
  return (
    <Pressable
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={tab.pressIn}
      onPressOut={tab.pressOut}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      {children}
    </Pressable>
  );
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
          tabBarButton: (props) => <TabButton tab={mapTab} props={props} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: '탐색',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="compass" color={color} scale={coursesTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={coursesTab} props={props} />,
        }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: '제보',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="plus-circle" color={color} scale={submitTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={submitTab} props={props} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="user" color={color} scale={profileTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={profileTab} props={props} />,
        }}
      />
    </Tabs>
  );
}
