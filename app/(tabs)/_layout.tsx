import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { BottomTabBarButtonProps } from 'expo-router/js-tabs';

import Colors, { semantic } from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useUnreadCount } from '@/hooks/useNotifications';
import SettingsButton from '@/components/navigation/SettingsButton';
import { NativeTabDeviceInsetsContext } from '@/components/navigation/NativeTabScreen';
import { FLOATING_TAB_BAR_HEIGHT, FLOATING_TAB_LIFT, TabOcclusionContext, useJsTabOcclusion } from '@/components/navigation/tabOcclusion';

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
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: React.ComponentProps<typeof Ionicons>['color'];
  scale: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons size={24} name={name} color={color} />
    </Animated.View>
  );
}

function LegacyTabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const occlusion = useJsTabOcclusion();

  const unreadCount = useUnreadCount();
  const mapTab = useTabPressScale();
  const coursesTab = useTabPressScale();
  const submitTab = useTabPressScale();
  const profileTab = useTabPressScale();

  return (
    <TabOcclusionContext.Provider value={occlusion}>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        // 레이아웃 높이를 먹지 않는 떠 있는 바. 화면 끝보다 조금 위에 둔다.
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + FLOATING_TAB_LIFT,
          height: FLOATING_TAB_BAR_HEIGHT,
          borderRadius: 28,
          borderTopWidth: 0,
          paddingTop: 4,
          backgroundColor: colors.surfaceElevated,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.16,
          shadowRadius: 16,
          elevation: 8,
        },
        tabBarLabelStyle: {
          marginTop: 2,
          fontSize: 11,
          fontWeight: '600',
        },
        headerTitleAlign: 'center',
        headerShadowVisible: false,
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '700',
        },
        headerStyle: {
          backgroundColor: colors.background,
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
        name="submit"
        options={{
          title: '제보',
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="add-circle" color={color} scale={submitTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={submitTab} props={props} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: '활동',
          tabBarBadge: unreadCount > 0 ? '' : undefined,
          tabBarBadgeStyle: { backgroundColor: semantic.danger, minWidth: 7, width: 7, height: 7 },
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="notifications-outline" color={color} scale={coursesTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={coursesTab} props={props} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          headerRight: () => <SettingsButton />,
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="person" color={color} scale={profileTab.scale} />
          ),
          tabBarButton: (props) => <TabButton tab={profileTab} props={props} />,
        }}
      />
    </Tabs>
    </TabOcclusionContext.Provider>
  );
}

function IosTabLayout() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const unreadCount = useUnreadCount();
  const deviceInsets = useSafeAreaInsets();
  return (
    <NativeTabDeviceInsetsContext.Provider value={deviceInsets}>
      <NativeTabs tintColor={colors.tint} iconColor={{ default: colors.textSecondary, selected: colors.tint }}
        badgeBackgroundColor={semantic.danger} minimizeBehavior="never" sidebarAdaptable={false}>
        <NativeTabs.Trigger name="index" disableAutomaticContentInsets disableScrollToTop disablePopToTop>
          <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
          <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="submit" disableAutomaticContentInsets disableScrollToTop>
          <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} md="add_circle" />
          <NativeTabs.Trigger.Label>제보</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="courses" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} md="notifications" />
          <NativeTabs.Trigger.Label>활동</NativeTabs.Trigger.Label>
          {unreadCount > 0 && <NativeTabs.Trigger.Badge />}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
          <NativeTabs.Trigger.Label>내 정보</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </NativeTabDeviceInsetsContext.Provider>
  );
}

export default function TabLayout() {
  // iOS 26 이상은 UIKit Liquid Glass, 이전 iOS는 같은 API의 기본 탭 외형이다.
  // Android·웹은 검증된 기존 JS 탭을 유지한다. 임의 BlurView나 OS별 높이를 넣지 않는다.
  return Platform.OS === 'ios' ? <IosTabLayout /> : <LegacyTabLayout />;
}
