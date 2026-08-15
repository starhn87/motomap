import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

const MEDIA_BUCKET = 'ridemap-media';
const MEDIA_PATH_MARKER = `/storage/v1/object/public/${MEDIA_BUCKET}/`;

// 크롭 UI 없음 — 아바타는 표시 단계에서 원형으로 중앙 크롭되므로
// 선택 시 잘라내기를 강제할 이유가 없다
export async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
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
    .from(MEDIA_BUCKET)
    .upload(fileName, decode(base64), {
      contentType,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

/** 이 앱의 공개 미디어 URL이면 Storage 객체를 지운다. 다른 URL은 건드리지 않는다. */
export async function removeUploadedImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(MEDIA_PATH_MARKER);
    if (markerIndex < 0) return;
    const path = decodeURIComponent(pathname.slice(markerIndex + MEDIA_PATH_MARKER.length));
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  } catch {
    // DB 저장·삭제는 이미 끝난 뒤 호출한다. 고아 파일 정리 실패가 UI를 되돌리면 안 된다.
  }
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
