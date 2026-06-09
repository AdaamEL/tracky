// @ts-nocheck — Deno runtime, pas Node.js
import nodemailer from 'npm:nodemailer'
import { createClient } from 'npm:@supabase/supabase-js@2'

const GMAIL_USER = Deno.env.get('GMAIL_USER')!
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Maps Supabase auth emails → real notification inboxes
const EMAIL_MAP: Record<string, string> = {
  'adam@tracky.app': 'adam.elounissi94@gmail.com',
  'sofiane@tracky.app': 'elounissisofiane@gmail.com',
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async () => {
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
      user_email: string
    }) => {
      const notificationEmail = EMAIL_MAP[event.user_email]
      if (!notificationEmail) return

      const minutesUntil = Math.round(
        (new Date(event.start_date).getTime() - now.getTime()) / 60_000,
      )

      const eventTime = new Date(event.start_date).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      })

      const eventDate = new Date(event.start_date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Paris',
      })

      await transporter.sendMail({
        from: `Tracky <${GMAIL_USER}>`,
        to: notificationEmail,
        subject: `Tracky · Rappel : ${event.title} dans ${minutesUntil} min`,
        html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.2em;color:#7a9e7e;margin:0 0 20px;">Tracky · Rappel</p>
    <h1 style="font-size:24px;font-weight:700;color:#1c1917;margin:0 0 8px;line-height:1.2;">${event.title}</h1>
    <p style="font-size:15px;color:#57534e;margin:0 0 4px;text-transform:capitalize;">${eventDate}</p>
    <p style="font-size:15px;color:#57534e;margin:0 0 24px;">${eventTime}</p>
    <div style="display:inline-block;background:#eef5ef;border-radius:20px;padding:8px 16px;">
      <span style="font-size:14px;font-weight:600;color:#4a7c59;">Dans ${minutesUntil} minute${minutesUntil > 1 ? 's' : ''}</span>
    </div>
    <hr style="border:none;border-top:1px solid #e8e0d0;margin:32px 0 16px;">
    <p style="font-size:11px;color:#a8a29e;margin:0;">Tracky · Agenda partagé</p>
  </div>
</body>
</html>`,
      })

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
