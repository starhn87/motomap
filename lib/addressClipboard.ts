import { requireOptionalNativeModule } from 'expo-modules-core';

type ClipboardModule = { setStringAsync(text: string, options: { inputFormat: 'plainText' }): Promise<boolean> };
// 이전 설치본에는 모듈이 없다. OTA에서도 import 실패 없이 기능 유무를 확인한다.
const clipboard = requireOptionalNativeModule<ClipboardModule>('ExpoClipboard');
export const canCopyAddress = typeof clipboard?.setStringAsync === 'function';

export async function copyAddress(address: string): Promise<boolean> {
  if (!clipboard || !address.trim()) return false;
  return clipboard.setStringAsync(address, { inputFormat: 'plainText' });
}
