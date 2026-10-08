// Telefono pranešimai (Web Push). Prenumerata saugoma lentelėje push_subscriptions,
// o priminimus siunčia serverio funkcija `remind` (paleidžiama kas 30 min.).
import type { Store } from '../data/store';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID;
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function b64ToBytes(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentPush(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try { return (await (await registration())?.pushManager.getSubscription()) ?? null; } catch { return null; }
}

/** Paprašo leidimo ir užprenumeruoja. Klaidos kodai: unsupported, denied, failed. */
export async function enablePush(store: Store): Promise<void> {
  if (!pushSupported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
  try {
    const reg = (await registration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) as BufferSource }));
    const j = sub.toJSON();
    await store.setPush({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' }, sub.endpoint);
  } catch (e) {
    console.error(e);
    throw Object.assign(new Error('failed'), { code: 'failed' });
  }
}

export async function disablePush(store: Store): Promise<void> {
  const sub = await currentPush(); if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* nesvarbu */ }
  await store.setPush(null, endpoint);
}

/** Programos failai išsaugomi telefone, kad atsidarytų ir be interneto; taip pat reikalinga pranešimams. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW', e));
}
