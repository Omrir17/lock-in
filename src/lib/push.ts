import { api } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied';

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window)) return standalone() ? 'unsupported' : 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Must run from a tap (iOS only allows the permission prompt after a user gesture). */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ההתראות לא אושרו. אפשר להפעיל אותן בהגדרות האייפון ← Lock-in ← התראות.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api<{ publicKey: string | null }>('push/key');
    if (!publicKey) throw new Error('מפתח ההתראות עוד לא הוגדר בשרת.');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  }
  await api('push/subscribe', { body: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('push/unsubscribe', { body: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
