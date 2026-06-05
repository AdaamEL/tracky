// @ts-nocheck — Deno runtime, pas Node.js : Deno.* et npm: imports sont normaux ici
import webpush from 'npm:web-push'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails(
  'mailto:adam.elounissi94@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async () => {
  // get_events_to_notify() returns events whose notification window just opened
  // (start_date - offset) fell within the last 2 minutes, not yet notified
  const { data: events, error } = await supabase.rpc('get_events_to_notify')

  if (error) return new Response(error.message, { status: 500 })
  if (!events?.length) return new Response('nothing to notify', { status: 200 })

  const now = new Date()

  await Promise.allSettled(
    events.map(async (event: {
      id: string
      user_id: string
      title: string
      start_date: string
      notification_offset_minutes: number
    }) => {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', event.user_id)

      if (!subs?.length) return

      const minutesUntil = Math.round(
        (new Date(event.start_date).getTime() - now.getTime()) / 60_000,
      )

      await Promise.allSettled(
        subs.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: 'Tracky',
              body: `${event.title} dans ${minutesUntil} min`,
              eventId: event.id,
            }),
          )
        ),
      )

      await supabase
        .from('events')
        .update({ notified_at: now.toISOString() })
        .eq('id', event.id)
    }),
  )

  return new Response(JSON.stringify({ notified: events.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
