import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { track } from '@/lib/analytics';

export default function SharedPlaceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    const placeId = typeof id === 'string' ? id.trim() : '';
    if (!placeId) {
      router.replace('/');
      return;
    }

    track.placeViewed({ place_id: placeId, source: 'share' });
    router.replace({
      pathname: '/',
      params: {
        focusPlaceId: placeId,
        focusTs: String(Date.now()),
      },
    });
  }, [id]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
