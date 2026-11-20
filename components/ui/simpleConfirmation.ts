import { Alert, Platform } from 'react-native';
import { appAlert, type DialogButton } from '@/lib/dialog';
import { useThemeStore } from '@/stores/useThemeStore';

/** 짧은 확인만 iOS 시스템 알림창에 표시한다. */
export function simpleConfirmation(title: string, message: string, confirm: DialogButton) {
  const buttons: DialogButton[] = [{ text: '취소', style: 'cancel' }, confirm];
  if (Platform.OS === 'ios') {
    const { mode } = useThemeStore.getState();
    Alert.alert(title, message, buttons, { userInterfaceStyle: mode === 'system' ? 'unspecified' : mode });
  } else {
    appAlert(title, message, buttons);
  }
}
