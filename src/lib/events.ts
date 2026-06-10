import { supabase } from './supabase'

export type Recurrence = 'none' | 'weekly' | 'monthly'

export type TrackyEvent = {
  id: string
  user_id: string
  title: string
  start_date?: string | null
  end_date?: string | null
  created_at?: string | null
  notification_offset_minutes?: number | null
  is_all_day?: boolean | null
  recurrence?: Recurrence | null
  recurrence_group_id?: string | null
}

export function buildDateTimeIso(date: string, time: string) {
  return new Date(`${date}T${time || '12:00'}:00`).toISOString()
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfDayIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString()
}

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export type EventKind = 'single' | 'recurring' | 'period'

// Classifies an event for color-coding: recurring events take priority,
// then multi-day spans count as "period", everything else is a one-off.
export function getEventKind(ev: Pick<TrackyEvent, 'recurrence' | 'start_date' | 'end_date'>): EventKind {
  if (ev.recurrence && ev.recurrence !== 'none') return 'recurring'
  if (ev.start_date && ev.end_date) {
    const start = new Date(ev.start_date)
    const end = new Date(ev.end_date)
    if (localDateKey(start) !== localDateKey(end)) return 'period'
  }
  return 'single'
}

// Returns all events whose date range overlaps with the given day
export async function fetchEventsByDate(userId: string, date: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .lte('start_date', endOfDayIso(date))
    .gte('end_date', startOfDayIso(date))
    .order('start_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as TrackyEvent[]
}

// Returns minimal event data for all events overlapping a given month (for calendar dots)
export async function fetchEventsByMonth(
  userId: string,
  year: number,
  month: number,
): Promise<Pick<TrackyEvent, 'id' | 'start_date' | 'end_date' | 'recurrence'>[]> {
  const monthStart = new Date(year, month - 1, 1).toISOString()
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999).toISOString()

  const { data, error } = await supabase
    .from('events')
    .select('id, start_date, end_date, recurrence')
    .eq('user_id', userId)
    .lte('start_date', monthEnd)
    .gte('end_date', monthStart)

  if (error) throw error
  return (data ?? []) as Pick<TrackyEvent, 'id' | 'start_date' | 'end_date' | 'recurrence'>[]
}

// Returns full events overlapping a given date range (for the weekly view)
export async function fetchEventsByRange(userId: string, startDate: string, endDate: string): Promise<TrackyEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .lte('start_date', endOfDayIso(endDate))
    .gte('end_date', startOfDayIso(startDate))
    .order('start_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as TrackyEvent[]
}

export async function createEvent(
  userId: string,
  title: string,
  startDate: string,
  time = '12:00',
  offsetMinutes: number | null = 15,
  isAllDay = false,
  recurrence: Recurrence = 'none',
  endDate?: string,
) {
  const eventTime = isAllDay ? '12:00' : time
  const effectiveEndDate = endDate ?? startDate

  if (recurrence === 'none') {
    const startTs = buildDateTimeIso(startDate, eventTime)
    const endTs = buildDateTimeIso(effectiveEndDate, eventTime)
    const { data, error } = await supabase
      .from('events')
      .insert([{
        user_id: userId,
        title,
        start_date: startTs,
        end_date: endTs,
        created_at: startTs,
        notification_offset_minutes: offsetMinutes,
        is_all_day: isAllDay,
        recurrence: 'none',
        recurrence_group_id: null,
      }])
      .select()
      .single()
    if (error) throw error
    return data as TrackyEvent
  }

  const groupId = crypto.randomUUID()
  const startBase = new Date(`${startDate}T12:00:00`)
  const endBase = new Date(`${effectiveEndDate}T12:00:00`)
  const durationDays = Math.round((endBase.getTime() - startBase.getTime()) / (1000 * 60 * 60 * 24))
  const count = recurrence === 'weekly' ? 52 : 12

  const rows = []
  for (let i = 0; i < count; i++) {
    const nextStart = new Date(startBase)
    if (recurrence === 'weekly') nextStart.setDate(startBase.getDate() + 7 * i)
    else nextStart.setMonth(startBase.getMonth() + i)
    const nextEnd = new Date(nextStart)
    nextEnd.setDate(nextStart.getDate() + durationDays)

    const startTs = buildDateTimeIso(localDateKey(nextStart), eventTime)
    const endTs = buildDateTimeIso(localDateKey(nextEnd), eventTime)
    rows.push({
      user_id: userId,
      title,
      start_date: startTs,
      end_date: endTs,
      created_at: startTs,
      notification_offset_minutes: offsetMinutes,
      is_all_day: isAllDay,
      recurrence,
      recurrence_group_id: groupId,
    })
  }

  const { data, error } = await supabase.from('events').insert(rows).select()
  if (error) throw error
  return (data?.[0] ?? null) as TrackyEvent
}

export async function updateEvent(
  id: string,
  title: string,
  startDate: string,
  time = '12:00',
  offsetMinutes: number | null = 15,
  isAllDay = false,
  endDate?: string,
) {
  const eventTime = isAllDay ? '12:00' : time
  const effectiveEndDate = endDate ?? startDate
  const startTs = buildDateTimeIso(startDate, eventTime)
  const endTs = buildDateTimeIso(effectiveEndDate, eventTime)

  const { data, error } = await supabase
    .from('events')
    .update({
      title,
      start_date: startTs,
      end_date: endTs,
      created_at: startTs,
      notification_offset_minutes: offsetMinutes,
      is_all_day: isAllDay,
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

export async function deleteEventGroup(groupId: string) {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('recurrence_group_id', groupId)
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
