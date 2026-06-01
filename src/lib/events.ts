import { supabase } from './supabase'

export type TrackyEvent = {
  id: string
  user_id: string
  title: string
  created_at?: string | null
}

function buildDateTimeIso(date: string, time: string) {
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

export async function createEvent(userId: string, title: string, date: string, time = '12:00') {
  const { data, error } = await supabase
    .from('events')
    .insert([{ user_id: userId, title, created_at: buildDateTimeIso(date, time) }])
    .select()
    .single()

  if (error) throw error
  return data as TrackyEvent
}

export async function updateEvent(id: string, title: string, date: string, time = '12:00') {
  const { data, error } = await supabase
    .from('events')
    .update({ title, created_at: buildDateTimeIso(date, time) })
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
