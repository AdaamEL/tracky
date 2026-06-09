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
  // Compute today's date range in Europe/Paris timezone
  const nowParis = new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [day, month, year] = nowParis.split('/')
  const todayKey = `${year}-${month}-${day}`
  const startOfDay = `${todayKey}T00:00:00+01:00`
  const endOfDay = `${todayKey}T23:59:59+01:00`

  const readableDate = new Date(`${todayKey}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Fetch all users
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) return new Response(usersError.message, { status: 500 })

  await Promise.allSettled(
    users.map(async (user) => {
      const notificationEmail = EMAIL_MAP[user.email ?? '']
      if (!notificationEmail) return

      const { data: events } = await supabase
        .from('events')
        .select('title, start_date')
        .eq('user_id', user.id)
        .gte('start_date', startOfDay)
        .lte('start_date', endOfDay)
        .order('start_date', { ascending: true })

      // No email if no events today
      if (!events?.length) return

      const eventRows = events.map((ev: { title: string; start_date: string }) => {
        const time = new Date(ev.start_date).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Paris',
        })
        return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;color:#4a7c59;font-size:13px;font-weight:700;white-space:nowrap;vertical-align:top;padding-right:16px;">${time}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;color:#1c1917;font-size:15px;vertical-align:top;">${ev.title}</td>
        </tr>`
      }).join('')

      await transporter.sendMail({
        from: `Tracky <${GMAIL_USER}>`,
        to: notificationEmail,
        subject: `Tracky · Agenda du ${readableDate}`,
        html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.2em;color:#7a9e7e;margin:0 0 6px;">Tracky · Agenda</p>
    <h1 style="font-size:26px;font-weight:700;color:#1c1917;margin:0 0 28px;text-transform:capitalize;">${readableDate}</h1>
    <table style="width:100%;border-collapse:collapse;">
      ${eventRows}
    </table>
    <hr style="border:none;border-top:1px solid #e8e0d0;margin:28px 0 16px;">
    <p style="font-size:11px;color:#a8a29e;margin:0;">Tracky · Agenda partagé</p>
  </div>
</body>
</html>`,
      })
    }),
  )

  return new Response('digest sent', { status: 200 })
})
