import * as ImagePicker from 'expo-image-picker';
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

export async function uploadImage(uri: string, folder: string): Promise<string> {
  const ext = uri.split('.').pop() ?? 'jpg';
  const fileName = `${folder}/${Date.now()}.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('photos')
    .upload(fileName, blob, {
      contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
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
