import AsyncStorage from '@react-native-async-storage/async-storage';

const RIDE_RECORDING_KEY = 'ride-recording-enabled:v1';

function keyForUser(userId: string): string {
  return `${RIDE_RECORDING_KEY}:${userId}`;
}

export async function isRideRecordingEnabled(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(keyForUser(userId))) === 'true';
}

export async function setRideRecordingEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), enabled ? 'true' : 'false');
}
