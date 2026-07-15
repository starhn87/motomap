import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

export async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: true,
  });

  if (result.canceled || !result.assets[0]) return null;

  return result.assets[0].uri;
}

// 여러 장 선택 — 크롭 UI 없음 (iOS 는 다중 선택과 편집을 동시에 지원하지 않고,
// 리뷰 사진은 원본 비율 그대로 올리는 게 자연스럽다)
export async function pickImages(limit: number): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });

  if (result.canceled) return [];
  return result.assets.map((a) => a.uri);
}

export async function uploadImage(uri: string, folder: string): Promise<string> {
  const ext = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const fileName = `${folder}/${Date.now()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const { error } = await supabase.storage
    .from('ridemap-media')
    .upload(fileName, decode(base64), {
      contentType,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('ridemap-media').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function uploadMultipleImages(
  uris: string[],
  folder: string
): Promise<string[]> {
  const urls: string[] = [];
  for (const uri of uris) {
    const url = await uploadImage(uri, folder);
    urls.push(url);
  }
  return urls;
}
