import type { SupabaseClient } from '@supabase/supabase-js'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
    // Wait for an active SW before returning — pushManager.subscribe() requires it.
    // navigator.serviceWorker.ready resolves only once a SW is active and controlling the page.
    return await navigator.serviceWorker.ready
  } catch (err) {
    console.error('[Tracky] Service worker registration failed:', err)
    return null
  }
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!vapidPublicKey) {
    console.error('[Tracky] VITE_VAPID_PUBLIC_KEY is missing')
    return null
  }
  try {
    const existing = await registration.pushManager.getSubscription()
    if (existing) return existing
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  } catch (err) {
    console.error('[Tracky] Push subscription failed:', err)
    return null
  }
}

export async function saveSubscription(
  client: SupabaseClient,
  userId: string,
  subscription: PushSubscription
): Promise<void> {
  const json = subscription.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  const { error } = await client.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'user_id,endpoint' }
  )
  if (error) {
    console.error('[Tracky] Failed to save push subscription:', error)
    throw error
  }
}
