import { supabase } from './supabase'

export type TrackyEvent = {
  id: string
  user_id: string
  title: string
  start_date?: string | null
  end_date?: string | null
  created_at?: string | null
  notification_offset_minutes?: number | null
}

export function buildDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time || '12:00'}:00`).toISOString()
}

function startOfDayIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString()
}

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export async function fetchEventsByDate(userId: string, date: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startOfDayIso(date))
    .lte('created_at', endOfDayIso(date))
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as TrackyEvent[]
}

export async function createEvent(
  userId: string,
  title: string,
  date: string,
  time = '12:00',
  offsetMinutes = 15,
) {
  const timestamp = buildDateTimeIso(date, time)

  const { data, error } = await supabase
    .from('events')
    .insert([
      {
        user_id: userId,
        title,
        start_date: timestamp,
        end_date: timestamp,
        created_at: timestamp,
        notification_offset_minutes: offsetMinutes,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as TrackyEvent
}

export async function updateEvent(
  id: string,
  title: string,
  date: string,
  time = '12:00',
  offsetMinutes = 15,
) {
  const timestamp = buildDateTimeIso(date, time)

  const { data, error } = await supabase
    .from('events')
    .update({
      title,
      start_date: timestamp,
      end_date: timestamp,
      created_at: timestamp,
      notification_offset_minutes: offsetMinutes,
      notified_at: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as TrackyEvent
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
  return true
}

export async function searchEvents(userId: string, query: string): Promise<TrackyEvent[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .ilike('title', `%${query.trim()}%`)
    .order('start_date', { ascending: true })
    .limit(50)
  if (error) throw error
  return (data ?? []) as TrackyEvent[]
}

export async function getConflictingEvents(
  userId: string,
  dateKey: string,
  time: string,
  excludeEventId?: string | null,
): Promise<TrackyEvent[]> {
  const timestamp = buildDateTimeIso(dateKey, time)
  const halfWindowMs = 30 * 60 * 1000
  const windowStart = new Date(new Date(timestamp).getTime() - halfWindowMs).toISOString()
  const windowEnd = new Date(new Date(timestamp).getTime() + halfWindowMs).toISOString()

  let query = supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_date', windowStart)
    .lte('start_date', windowEnd)

  if (excludeEventId) query = query.neq('id', excludeEventId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TrackyEvent[]
}
