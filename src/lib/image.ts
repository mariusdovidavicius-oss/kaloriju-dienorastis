import type { ImageInput } from '../types';

const MAX_SIDE = 1568;

/** Sumažina nuotrauką (telefono nuotraukos būna 5–10 MB) ir paverčia JPEG base64. */
export async function prepareImage(file: File): Promise<ImageInput> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw Object.assign(new Error('image'), { code: 'image_rejected' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Object.assign(new Error('image'), { code: 'image_rejected' });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), name: file.name || 'nuotrauka' };
}
