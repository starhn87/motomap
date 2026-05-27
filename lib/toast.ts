import Toast from 'react-native-toast-message';

export const toast = {
  success: (message: string, description?: string) =>
    Toast.show({
      type: 'success',
      text1: message,
      text2: description,
      position: 'bottom',
      visibilityTime: 2500,
    }),
  error: (message: string, description?: string) =>
    Toast.show({
      type: 'error',
      text1: message,
      text2: description,
      position: 'bottom',
      visibilityTime: 3500,
    }),
  info: (message: string, description?: string) =>
    Toast.show({
      type: 'info',
      text1: message,
      text2: description,
      position: 'bottom',
      visibilityTime: 2500,
    }),
};
