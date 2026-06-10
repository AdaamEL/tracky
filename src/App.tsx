import { useEffect, useMemo, useState } from 'react'
import { fr } from 'date-fns/locale/fr'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Car,
  Clock3,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { createEvent, deleteEvent, deleteEventGroup, fetchEventsByDate, fetchEventsByMonth, getConflictingEvents, searchEvents, type Recurrence, type TrackyEvent, updateEvent } from '@/lib/events'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: 'creator' | 'brother'
  label: string
  email: string
  tone: string
  accent: string
  dot: string
}

const profiles: Profile[] = [
  {
    id: 'creator',
    label: 'Profil 1',
    email: 'adam@tracky.app',
    tone: 'Perso',
    accent: 'from-emerald-100/70 via-green-50/50 to-transparent',
    dot: 'bg-emerald-400',
  },
  {
    id: 'brother',
    label: 'Profil 2',
    email: 'sofiane@tracky.app',
    tone: 'As Motors',
    accent: 'from-amber-100/70 via-orange-50/50 to-transparent',
    dot: 'bg-amber-400',
  },
]

function dateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatEventTime(createdAt?: string | null) {
  if (!createdAt) return '12:00'
  return new Date(createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatReadableDate(date: Date) {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function App() {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [sessionUser, setSessionUser] = useState<{ id: string; email?: string } | null>(null)

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [events, setEvents] = useState<TrackyEvent[]>([])
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventTime, setEventTime] = useState('12:00')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editingEventDateKey, setEditingEventDateKey] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'calendar' | 'today'>('calendar')
  const [eventNotifOffset, setEventNotifOffset] = useState<number | null>(15)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TrackyEvent[]>([])
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  // Conflict detection
  const [conflictingEvents, setConflictingEvents] = useState<TrackyEvent[]>([])

  // Event form extras
  const [eventIsAllDay, setEventIsAllDay] = useState(false)
  const [eventRecurrence, setEventRecurrence] = useState<Recurrence>('none')
  const [eventEndDateKey, setEventEndDateKey] = useState('')
  const [eventStartDateKey, setEventStartDateKey] = useState('')
  const [eventTab, setEventTab] = useState<'single' | 'recurring' | 'period'>('single')

  // Calendar month events (for dots)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [monthEvents, setMonthEvents] = useState<Pick<TrackyEvent, 'id' | 'start_date' | 'end_date'>[]>([])

  // Delete confirmation for recurring events
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<TrackyEvent | null>(null)

  const today = new Date()
  const todayKey = dateKeyFromDate(today)
  const selectedDateKey = selectedDate ? dateKeyFromDate(selectedDate) : null
  const visibleDateKey = activeView === 'today' ? todayKey : selectedDateKey
  const selectedLabel = activeProfile ? `${activeProfile.label} · ${activeProfile.tone}` : ''
  const eventCount = events.length
  const hasSession = Boolean(sessionUser)
  const surfaceTitle = activeView === 'today' ? 'Aujourd\'hui' : 'Calendrier'
  const surfaceDescription = activeView === 'today' ? 'Vue rapide, optimisée pour le pouce.' : 'Navigation précise, pensée mobile-first.'

  // Calendar dots: expand multi-day events into individual Date objects per day
  const daysWithEvents = useMemo(() => {
    const days: Date[] = []
    for (const ev of monthEvents) {
      if (!ev.start_date) continue
      const start = new Date(ev.start_date)
      const end = ev.end_date ? new Date(ev.end_date) : start
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      while (cur <= endDay) {
        days.push(new Date(cur))
        cur.setDate(cur.getDate() + 1)
      }
    }
    return days
  }, [monthEvents])

  useEffect(() => {
    let mounted = true

    async function loadEvents() {
      if (!sessionUser || !visibleDateKey) {
        setEvents([])
        return
      }
      try {
        const list = await fetchEventsByDate(sessionUser.id, visibleDateKey)
        if (mounted) setEvents(list)
      } catch (err) {
        console.error('Failed fetching events', err)
      }
    }

    loadEvents()
    return () => { mounted = false }
  }, [sessionUser, visibleDateKey])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setSessionEmail(data.session?.user.email ?? null)
      if (data.session?.user) {
        setSessionUser({ id: data.session.user.id, email: data.session.user.email ?? undefined })
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null)
      if (session?.user) {
        setSessionUser({ id: session.user.id, email: session.user.email ?? undefined })
      } else {
        setSessionUser(null)
      }
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionUser || !visibleDateKey) return

    const channel = supabase
      .channel(`events-${sessionUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
          filter: `user_id=eq.${sessionUser.id}`,
        },
        async () => {
          const list = await fetchEventsByDate(sessionUser.id, visibleDateKey)
          setEvents(list)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionUser, visibleDateKey])

  // Month events for calendar dots
  useEffect(() => {
    if (!sessionUser) return
    fetchEventsByMonth(sessionUser.id, calendarMonth.getFullYear(), calendarMonth.getMonth() + 1)
      .then(setMonthEvents)
      .catch(console.error)
  }, [sessionUser, calendarMonth])

  // Search debounce
  useEffect(() => {
    if (!sessionUser || !searchQuery.trim()) {
      setSearchResults([])
      setIsSearchLoading(false)
      return
    }
    setIsSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchEvents(sessionUser.id, searchQuery)
        setSearchResults(results)
      } catch (err) {
        console.error('Search failed', err)
      } finally {
        setIsSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [sessionUser, searchQuery])

  // Conflict detection
  useEffect(() => {
    if (!sessionUser || !eventDialogOpen || !visibleDateKey || !eventTime || eventTab === 'period' || eventIsAllDay) {
      setConflictingEvents([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const conflicts = await getConflictingEvents(sessionUser.id, visibleDateKey, eventTime, editingEventId)
        setConflictingEvents(conflicts)
      } catch (err) {
        console.error('Conflict check failed', err)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [sessionUser, eventDialogOpen, visibleDateKey, eventTime, editingEventId, eventTab, eventIsAllDay])

  const openProfile = (profile: Profile) => {
    setActiveProfile(profile)
    setPin('')
    setError(null)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setError(null)
    setPin('')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setSessionEmail(null)
    setSessionUser(null)
  }

  const handleSubmit = async (event: { preventDefault(): void }) => {
    event.preventDefault()
    if (!activeProfile || pin.length === 0) return

    setIsSigningIn(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: activeProfile.email,
      password: pin,
    })

    if (signInError) {
      setError(signInError.message)
      setIsSigningIn(false)
      return
    }

    setSessionEmail(data.user?.email ?? activeProfile.email)
    setIsSigningIn(false)
    closeDrawer()
  }

  const openCreateDialog = () => {
    setEditingEventId(null)
    setEditingEventDateKey(null)
    setEventTitle('')
    setEventTime('12:00')
    setEventNotifOffset(15)
    setEventIsAllDay(false)
    setEventRecurrence('none')
    setEventStartDateKey(visibleDateKey ?? '')
    setEventEndDateKey(visibleDateKey ?? '')
    setEventTab('single')
    setConflictingEvents([])
    setEventDialogOpen(true)
  }

  const openEditDialog = (event: TrackyEvent) => {
    setEditingEventId(event.id)
    const startKey = event.start_date ? dateKeyFromDate(new Date(event.start_date)) : visibleDateKey
    const endKey = event.end_date ? dateKeyFromDate(new Date(event.end_date)) : (startKey ?? '')
    setEditingEventDateKey(startKey)
    setEventTitle(event.title)
    setEventTime(formatEventTime(event.start_date))
    setEventNotifOffset(event.notification_offset_minutes ?? null)
    setEventIsAllDay(event.is_all_day ?? false)
    setEventRecurrence(event.recurrence ?? 'none')
    setEventStartDateKey(startKey ?? '')
    setEventEndDateKey(endKey)

    if (event.recurrence && event.recurrence !== 'none') {
      setEventTab('recurring')
    } else if (startKey && endKey && startKey !== endKey) {
      setEventTab('period')
    } else {
      setEventTab('single')
    }

    setConflictingEvents([])
    setEventDialogOpen(true)
  }

  const switchEventTab = (tab: 'single' | 'recurring' | 'period') => {
    setEventTab(tab)
    if (tab === 'single') {
      setEventRecurrence('none')
      setEventIsAllDay(false)
      setEventEndDateKey(eventStartDateKey || visibleDateKey || '')
    } else if (tab === 'recurring') {
      setEventRecurrence((prev) => (prev === 'none' ? 'weekly' : prev))
      setEventIsAllDay(false)
      setEventEndDateKey(eventStartDateKey || visibleDateKey || '')
    } else {
      setEventRecurrence('none')
      setEventIsAllDay(true)
      const base = eventStartDateKey || visibleDateKey
      if (base && (!eventEndDateKey || eventEndDateKey <= base)) {
        const next = new Date(`${base}T12:00:00`)
        next.setDate(next.getDate() + 1)
        setEventEndDateKey(dateKeyFromDate(next))
      }
    }
  }

  const refetchVisibleEvents = async () => {
    if (!sessionUser || !visibleDateKey) return
    const list = await fetchEventsByDate(sessionUser.id, visibleDateKey)
    setEvents(list)
    fetchEventsByMonth(sessionUser.id, calendarMonth.getFullYear(), calendarMonth.getMonth() + 1)
      .then(setMonthEvents)
      .catch(console.error)
  }

  const eventLabel = activeView === 'today' ? 'Événements d\'aujourd\'hui' : 'Événements du jour'

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-3 sm:px-6 sm:py-6">
      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="tracky-float absolute -top-20 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(122,172,128,0.22),transparent_70%)] blur-3xl" />
        <div className="tracky-float absolute right-[-3rem] top-28 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(196,176,140,0.18),transparent_70%)] blur-3xl [animation-delay:2s]" />
        <div className="tracky-float absolute bottom-20 left-[-2rem] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(212,196,160,0.14),transparent_70%)] blur-3xl [animation-delay:4s]" />
      </div>

      {/* Main app card */}
      <div className="relative mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-stone-200/70 bg-white/88 shadow-[0_4px_20px_rgba(44,38,32,0.07),0_16px_50px_rgba(44,38,32,0.05)] backdrop-blur-md sm:min-h-[calc(100vh-3rem)]">

        {/* Scrollable content area */}
        <section className="flex-1 space-y-5 p-4 pb-32 sm:p-5 sm:pb-32">

          {/* ── Header ── */}
          <header className="flex items-center justify-between gap-3 pt-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-emerald-700">
              <Sparkles className="size-3 text-emerald-500" />
              Tracky
            </div>

            <div className="flex items-center gap-1.5">
              <div className="rounded-full border border-stone-200 bg-stone-50/80 px-2.5 py-1 text-[0.68rem] font-medium text-stone-500">
                Duo privé
              </div>
              {hasSession ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="cursor-pointer rounded-full border border-stone-200 bg-stone-50/80 px-3 text-stone-600 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  <LogOut className="mr-1.5 size-3.5" />
                  Sortie
                </Button>
              ) : null}
            </div>
          </header>

          {/* Session indicator */}
          {sessionEmail ? (
            <div className="tracky-fade-in inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
              <span className="truncate">{sessionEmail}</span>
            </div>
          ) : null}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="tracky-scale-in rounded-2xl border border-stone-100 bg-stone-50/70 p-3 shadow-sm" style={{ animationDelay: '0ms' }}>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-stone-400">Aujourd'hui</p>
              <p className="mt-1 text-[0.78rem] font-semibold capitalize leading-tight text-stone-800">{formatReadableDate(today)}</p>
            </div>
            <div className="tracky-scale-in rounded-2xl border border-stone-100 bg-stone-50/70 p-3 shadow-sm" style={{ animationDelay: '50ms' }}>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-stone-400">Vue active</p>
              <p className="mt-1 text-[0.78rem] font-semibold text-stone-800">{surfaceTitle}</p>
            </div>
            <div className="tracky-scale-in rounded-2xl border border-stone-100 bg-stone-50/70 p-3 shadow-sm" style={{ animationDelay: '100ms' }}>
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-stone-400">Réel</p>
              <p className="mt-1 text-[0.78rem] font-semibold text-stone-800">
                {hasSession ? `${eventCount} evt${eventCount > 1 ? 's' : ''}` : 'Privé'}
              </p>
            </div>
          </div>

          {/* ── Logged in ── */}
          {hasSession ? (
            <div className="space-y-4">

              {/* View toggle */}
              <div className="grid grid-cols-2 gap-1.5 rounded-[1.4rem] border border-stone-100 bg-stone-50/60 p-1.5">
                <Button
                  onClick={() => setActiveView('calendar')}
                  className={`cursor-pointer h-11 rounded-[1rem] text-sm font-medium transition-all duration-200 ${
                    activeView === 'calendar'
                      ? 'bg-emerald-600 text-white shadow-[0_4px_14px_rgba(77,133,85,0.30)] hover:bg-emerald-700'
                      : 'bg-transparent text-stone-500 shadow-none hover:bg-stone-100 hover:text-stone-700'
                  }`}
                >
                  <CalendarDays className="mr-2 size-4" />
                  Calendrier
                </Button>
                <Button
                  onClick={() => setActiveView('today')}
                  className={`cursor-pointer h-11 rounded-[1rem] text-sm font-medium transition-all duration-200 ${
                    activeView === 'today'
                      ? 'bg-emerald-600 text-white shadow-[0_4px_14px_rgba(77,133,85,0.30)] hover:bg-emerald-700'
                      : 'bg-transparent text-stone-500 shadow-none hover:bg-stone-100 hover:text-stone-700'
                  }`}
                >
                  <Clock3 className="mr-2 size-4" />
                  Aujourd'hui
                </Button>
              </div>

              {/* Calendar / Today panel */}
              <div className="overflow-hidden rounded-[1.6rem] border border-stone-100 bg-stone-50/60 shadow-sm">
                {activeView === 'calendar' ? (
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date: Date | undefined) => setSelectedDate(date)}
                    onMonthChange={setCalendarMonth}
                    locale={fr}
                    modifiers={{ hasEvent: daysWithEvents }}
                    modifiersClassNames={{ hasEvent: 'day-has-event' }}
                    className="w-full rounded-[1.4rem] p-3 shadow-none"
                  />
                ) : (
                  <div className="rounded-[1.4rem] bg-gradient-to-br from-emerald-50 via-stone-50 to-white p-5">
                    <p className="text-[0.66rem] font-semibold uppercase tracking-[0.26em] text-emerald-600">{surfaceTitle}</p>
                    <h3 className="mt-2 font-serif text-2xl font-semibold capitalize text-stone-900">{formatReadableDate(today)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">{surfaceDescription}</p>
                  </div>
                )}
              </div>

              {/* Events list */}
              <div>
                {/* Search bar */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un événement…"
                    className="h-10 rounded-2xl border-stone-200 bg-stone-50 pl-9 pr-9 text-sm placeholder:text-stone-300 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-stone-400 hover:text-stone-600"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-700">
                    {searchQuery.trim() ? `Résultats pour « ${searchQuery.trim()} »` : eventLabel}
                  </h3>
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[0.68rem] font-medium text-stone-500">
                    {searchQuery.trim() ? `${searchResults.length} résultat${searchResults.length !== 1 ? 's' : ''}` : `${eventCount} élément${eventCount !== 1 ? 's' : ''}`}
                  </span>
                </div>

                {searchQuery.trim() ? (
                  <div className="space-y-2">
                    {isSearchLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="size-5 animate-spin text-stone-400" />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-stone-100 bg-stone-50/60 p-4 text-sm text-stone-400">
                        Aucun résultat pour cette recherche.
                      </div>
                    ) : (
                      searchResults.map((ev, index) => (
                        <div
                          key={ev.id}
                          className="group tracky-rise rounded-[1.2rem] border border-stone-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                          style={{ animationDelay: `${index * 45}ms` }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.7rem] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                                  {formatEventTime(ev.start_date)}
                                </span>
                                <span className="text-[0.66rem] font-medium uppercase tracking-[0.2em] text-stone-400">
                                  {ev.start_date ? new Date(ev.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}
                                </span>
                              </div>
                              <div className="truncate text-sm font-semibold text-stone-800">{ev.title}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="cursor-pointer size-8 rounded-full text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                onClick={() => openEditDialog(ev)}
                                aria-label="Modifier l'événement"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="cursor-pointer size-8 rounded-full text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                                onClick={async () => {
                                  await deleteEvent(ev.id)
                                  setSearchResults(prev => prev.filter(r => r.id !== ev.id))
                                  await refetchVisibleEvents()
                                }}
                                aria-label="Supprimer l'événement"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                <div className="space-y-2">
                  {events.length === 0 ? (
                    <div className="rounded-[1.2rem] border border-stone-100 bg-stone-50/60 p-4 text-sm text-stone-400">
                      Aucun événement pour cette date.
                    </div>
                  ) : (
                    events.map((ev, index) => (
                      <div
                        key={ev.id}
                        className="group tracky-rise rounded-[1.2rem] border border-stone-100 bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        style={{ animationDelay: `${index * 45}ms` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[0.7rem] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                                {ev.is_all_day ? 'Toute la journée' : formatEventTime(ev.created_at)}
                              </span>
                              {ev.recurrence_group_id ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[0.66rem] font-medium text-stone-500">
                                  <RefreshCw className="size-2.5" />
                                  {ev.recurrence === 'weekly' ? 'Hebdo' : 'Mensuel'}
                                </span>
                              ) : null}
                              <span className="text-[0.66rem] font-medium uppercase tracking-[0.2em] text-stone-400">
                                {dateKeyFromDate(new Date(ev.created_at ?? today.toISOString())) === todayKey ? 'Aujourd\'hui' : 'Planifié'}
                              </span>
                            </div>
                            <div className="truncate text-sm font-semibold text-stone-800">{ev.title}</div>
                            {ev.start_date && ev.end_date && dateKeyFromDate(new Date(ev.start_date)) !== dateKeyFromDate(new Date(ev.end_date)) ? (
                              <div className="text-xs font-medium text-emerald-600">
                                Du {new Date(ev.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au {new Date(ev.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                              </div>
                            ) : (
                              <div className="text-xs text-stone-400">Synchronisé en temps réel</div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="cursor-pointer size-8 rounded-full text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                              onClick={() => openEditDialog(ev)}
                              aria-label="Modifier l'événement"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="cursor-pointer size-8 rounded-full text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                              onClick={() => {
                                if (ev.recurrence_group_id) {
                                  setDeleteConfirmEvent(ev)
                                } else {
                                  deleteEvent(ev.id).then(refetchVisibleEvents)
                                }
                              }}
                              aria-label="Supprimer l'événement"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                )}
              </div>
            </div>

          ) : (
            /* ── Not logged in ── */
            <div className="space-y-4">

              {/* Welcome card */}
              <div className="tracky-fade-in rounded-[1.6rem] border border-stone-100 bg-gradient-to-br from-stone-50 to-white p-5 shadow-sm">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.26em] text-emerald-600">Accès privé</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold leading-snug text-stone-900">
                  Choisis un profil pour ouvrir Tracky.
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-stone-500">
                  La connexion se fait par PIN, dans une interface pensée pour être rapide au pouce.
                </p>
              </div>

              {/* Profile cards */}
              <div className="grid gap-3">
                {profiles.map((profile, index) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => openProfile(profile)}
                    className="tracky-rise group relative cursor-pointer overflow-hidden rounded-[1.4rem] border border-stone-200/80 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${profile.accent}`} />
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-stone-500">{profile.label}</p>
                        <p className="text-lg font-semibold text-stone-900">{profile.tone}</p>
                        <p className="text-sm text-stone-500">{profile.email}</p>
                      </div>
                      <div className="flex size-12 items-center justify-center rounded-2xl border border-stone-200/80 bg-white/90 text-stone-600 shadow-sm transition-transform duration-200 group-hover:scale-105">
                        <Users className="size-5" />
                      </div>
                    </div>
                    <div className="relative mt-3 flex items-center gap-1.5 text-xs font-semibold text-stone-500 transition-colors duration-200 group-hover:text-stone-700">
                      Ouvrir
                      <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Footer bar */}
        <section className="border-t border-stone-100 bg-stone-50/60 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between rounded-[1.2rem] border border-stone-100 bg-white/80 px-4 py-3 shadow-sm">
            <span className="inline-flex items-center gap-2 text-sm text-stone-600">
              <LockKeyhole className="size-4 text-emerald-500" />
              Connexion PIN privée
            </span>
            <span className="text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-stone-400">Supabase Auth</span>
          </div>
        </section>
      </div>

      {/* ── FAB + Bottom nav (logged in only) ── */}
      {hasSession ? (
        <div>
          {/* FAB */}
          <div className="fixed left-0 right-0 z-50 flex items-center justify-center" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
            <button
              onClick={openCreateDialog}
              className="inline-flex size-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_6px_22px_rgba(77,133,85,0.42)] transition-all duration-200 hover:scale-105 hover:shadow-[0_10px_28px_rgba(77,133,85,0.48)] active:scale-95"
              aria-label="Ajouter un événement"
            >
              <Plus className="size-6" />
            </button>
          </div>

          {/* Bottom navigation */}
          <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200/80 bg-white/92 px-3 pt-3 backdrop-blur-xl" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
            <div className="mx-auto flex w-full max-w-md items-center gap-1.5 rounded-[1.3rem] border border-stone-100 bg-stone-50/60 p-1.5">
              <Button
                onClick={() => setActiveView('calendar')}
                className={`h-11 flex-1 cursor-pointer rounded-[1rem] text-sm font-medium transition-all duration-200 ${
                  activeView === 'calendar'
                    ? 'bg-emerald-600 text-white shadow-[0_3px_10px_rgba(77,133,85,0.25)] hover:bg-emerald-700'
                    : 'bg-transparent text-stone-500 shadow-none hover:bg-stone-100 hover:text-stone-700'
                }`}
              >
                Calendrier
              </Button>
              <Button
                onClick={() => setActiveView('today')}
                className={`h-11 flex-1 cursor-pointer rounded-[1rem] text-sm font-medium transition-all duration-200 ${
                  activeView === 'today'
                    ? 'bg-emerald-600 text-white shadow-[0_3px_10px_rgba(77,133,85,0.25)] hover:bg-emerald-700'
                    : 'bg-transparent text-stone-500 shadow-none hover:bg-stone-100 hover:text-stone-700'
                }`}
              >
                Aujourd'hui
              </Button>
              <Button
                onClick={handleSignOut}
                className="h-11 cursor-pointer rounded-[1rem] bg-transparent px-4 text-sm text-stone-500 shadow-none hover:bg-rose-50 hover:text-rose-500"
              >
                Sortie
              </Button>
            </div>
          </nav>
        </div>
      ) : null}

      {/* ── Login Drawer ── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="border-stone-200/80 bg-white text-stone-900 shadow-[0_-6px_30px_rgba(44,38,32,0.10)]">
          <DrawerHeader className="p-5 text-left">
            <DrawerTitle className="text-lg font-semibold text-stone-900">{selectedLabel || 'Connexion'}</DrawerTitle>
            <DrawerDescription className="mt-1 text-sm text-stone-500">
              Saisis le code PIN associé au profil pour ouvrir Tracky.
            </DrawerDescription>
          </DrawerHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-6">
            <div className="space-y-2">
              <label htmlFor="pin" className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
                Code PIN
              </label>
              <Input
                id="pin"
                value={pin}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="••••••"
                onChange={(event) => setPin(event.target.value)}
                className="h-12 rounded-2xl border-stone-200 bg-stone-50 text-base tracking-[0.35em] text-stone-900 placeholder:tracking-[0.15em] placeholder:text-stone-300 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <DrawerFooter className="px-0 pb-0">
              <Button
                type="submit"
                className="h-12 cursor-pointer rounded-2xl bg-emerald-600 text-white shadow-[0_5px_18px_rgba(77,133,85,0.32)] hover:bg-emerald-700 disabled:opacity-50"
                disabled={isSigningIn || pin.length === 0}
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    Ouvrir Tracky
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {/* ── Event Dialog ── */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-md border-stone-200/80 bg-white text-stone-900 shadow-[0_8px_40px_rgba(44,38,32,0.12)]">
          <DialogHeader>
            <DialogTitle className="text-stone-900">
              {editingEventId ? 'Modifier l\'événement' : 'Nouvel événement'}
            </DialogTitle>
            <DialogDescription className="text-stone-500">
              {eventTab === 'recurring'
                ? 'Se répète automatiquement chaque semaine ou chaque mois.'
                : eventTab === 'period'
                  ? 'Pour suivre une période de location ou d\'indisponibilité.'
                  : 'Un événement simple, à une date précise.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Tab selector (create mode) / type indicator (edit mode) */}
            {!editingEventId ? (
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-stone-200 bg-stone-50 p-1">
                {([
                  { id: 'single', label: 'Ponctuel', icon: CalendarDays },
                  { id: 'recurring', label: 'Récurrent', icon: RefreshCw },
                  { id: 'period', label: 'Période', icon: Car },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchEventTab(id)}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl py-2 text-[0.7rem] font-medium transition-all duration-150 ${
                      eventTab === id
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {eventTab === 'recurring' ? (
                  <RefreshCw className="size-3.5 shrink-0" />
                ) : eventTab === 'period' ? (
                  <Car className="size-3.5 shrink-0" />
                ) : (
                  <CalendarDays className="size-3.5 shrink-0" />
                )}
                {eventTab === 'recurring'
                  ? `Événement récurrent · ${eventRecurrence === 'weekly' ? 'Chaque semaine' : 'Chaque mois'}`
                  : eventTab === 'period'
                    ? 'Événement sur une période'
                    : 'Événement ponctuel'}
              </div>
            )}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              {eventTab === 'period' ? 'Véhicule / Client' : 'Titre'}
            </label>
            <Input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder={eventTab === 'period' ? 'Ex : Clio 5 - Jean Dupont' : 'Titre de l\'événement'}
              className="h-11 rounded-2xl border-stone-200 bg-stone-50 text-stone-900 placeholder:text-stone-300 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
            />

            {eventTab === 'period' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Du</label>
                  <Input
                    type="date"
                    value={eventStartDateKey}
                    onChange={(e) => {
                      const value = e.target.value
                      setEventStartDateKey(value)
                      if (eventEndDateKey && eventEndDateKey < value) setEventEndDateKey(value)
                    }}
                    className="h-11 w-full rounded-2xl border-stone-200 bg-stone-50 text-stone-900 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Au</label>
                  <Input
                    type="date"
                    value={eventEndDateKey}
                    onChange={(e) => setEventEndDateKey(e.target.value)}
                    min={eventStartDateKey || undefined}
                    className="h-11 w-full rounded-2xl border-stone-200 bg-stone-50 text-stone-900 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                  />
                </div>
              </div>
            ) : (
              <>
                {/* All-day toggle */}
                <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5">
                  <span className="text-sm font-medium text-stone-700">Journée entière</span>
                  <button
                    type="button"
                    onClick={() => setEventIsAllDay(v => !v)}
                    className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${eventIsAllDay ? 'bg-emerald-500' : 'bg-stone-200'}`}
                  >
                    <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform duration-200 ${eventIsAllDay ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {!eventIsAllDay ? (
                  <>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Heure</label>
                    <Input
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      type="time"
                      className="h-11 w-full rounded-2xl border-stone-200 bg-stone-50 text-stone-900 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200/50"
                    />
                  </>
                ) : null}

                {/* Recurrence type (create mode only) */}
                {eventTab === 'recurring' && !editingEventId ? (
                  <>
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Se répète</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'weekly', label: 'Chaque semaine' },
                        { value: 'monthly', label: 'Chaque mois' },
                      ] as const).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEventRecurrence(value)}
                          className={`cursor-pointer rounded-xl border py-2.5 text-xs font-medium transition-all duration-150 ${
                            eventRecurrence === value
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                              : 'border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {conflictingEvents.length > 0 ? (
                  <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <div className="text-xs leading-relaxed text-amber-800">
                      <span className="font-semibold">Conflit détecté.</span>{' '}
                      {conflictingEvents.map(e => e.title).join(', ')} est dans la même fenêtre de 30 min.
                    </div>
                  </div>
                ) : null}
              </>
            )}

            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Rappel</label>
            <div className="flex flex-wrap gap-2">
              {([null, 5, 15, 30, 60] as Array<number | null>).map((min) => (
                <button
                  key={min ?? 'none'}
                  type="button"
                  onClick={() => setEventNotifOffset(min)}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-medium transition-all duration-150 ${
                    eventNotifOffset === min
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
                      : 'border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-700'
                  }`}
                >
                  {min === null ? 'Aucun' : min < 60 ? `${min} min` : '1 h'}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-stone-100 pt-4">
            <Button
              variant="outline"
              onClick={() => setEventDialogOpen(false)}
              className="cursor-pointer border-stone-200 bg-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-800"
            >
              Annuler
            </Button>
            <Button
              onClick={async () => {
                if (!sessionUser) return

                const targetDateKey = eventTab === 'period'
                  ? (eventStartDateKey || visibleDateKey)
                  : (editingEventId ? editingEventDateKey ?? visibleDateKey : visibleDateKey)
                if (!targetDateKey) return

                const endKey = eventTab === 'period' ? (eventEndDateKey || targetDateKey) : targetDateKey

                if (editingEventId) {
                  await updateEvent(editingEventId, eventTitle || 'Nouvel événement', targetDateKey, eventTime, eventNotifOffset, eventIsAllDay, endKey)
                } else {
                  await createEvent(sessionUser.id, eventTitle || 'Nouvel événement', targetDateKey, eventTime, eventNotifOffset, eventIsAllDay, eventRecurrence, endKey)
                }

                await refetchVisibleEvents()
                setEventTitle('')
                setEventTime('12:00')
                setEventNotifOffset(15)
                setEventIsAllDay(false)
                setEventRecurrence('none')
                setEventStartDateKey('')
                setEventEndDateKey('')
                setEventTab('single')
                setEditingEventId(null)
                setEditingEventDateKey(null)
                setConflictingEvents([])
                setEventDialogOpen(false)
              }}
              className="cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {editingEventId ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Delete confirmation for recurring events ── */}
      <Dialog open={Boolean(deleteConfirmEvent)} onOpenChange={(open) => { if (!open) setDeleteConfirmEvent(null) }}>
        <DialogContent className="max-w-sm border-stone-200/80 bg-white text-stone-900 shadow-[0_8px_40px_rgba(44,38,32,0.12)]">
          <DialogHeader>
            <DialogTitle className="text-stone-900">Supprimer l'événement récurrent</DialogTitle>
            <DialogDescription className="text-stone-500">
              "{deleteConfirmEvent?.title}" fait partie d'une série. Que souhaites-tu supprimer ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="cursor-pointer w-full border-stone-200 text-stone-700 hover:bg-stone-50"
              onClick={async () => {
                if (!deleteConfirmEvent) return
                await deleteEvent(deleteConfirmEvent.id)
                setDeleteConfirmEvent(null)
                await refetchVisibleEvents()
              }}
            >
              Cet événement uniquement
            </Button>
            <Button
              className="cursor-pointer w-full bg-rose-500 text-white hover:bg-rose-600"
              onClick={async () => {
                if (!deleteConfirmEvent?.recurrence_group_id) return
                await deleteEventGroup(deleteConfirmEvent.recurrence_group_id)
                setDeleteConfirmEvent(null)
                await refetchVisibleEvents()
              }}
            >
              Toute la série
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default App
