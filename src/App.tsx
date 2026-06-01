import { useEffect, useState } from 'react'
import { fr } from 'date-fns/locale/fr'
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Loader2,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { createEvent, deleteEvent, fetchEventsByDate, type TrackyEvent, updateEvent } from '@/lib/events'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: 'creator' | 'brother'
  label: string
  email: string
  tone: string
  accent: string
}

const profiles: Profile[] = [
  {
    id: 'creator',
    label: 'Profil 1',
    email: 'adam@tracky.app',
    tone: 'Perso',
    accent: 'from-cyan-400/30 via-sky-400/15 to-transparent',
  },
  {
    id: 'brother',
    label: 'Profil 2',
    email: 'sofiane@tracky.app',
    tone: 'As Motors',
    accent: 'from-emerald-400/30 via-teal-400/15 to-transparent',
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

  const today = new Date()
  const todayKey = dateKeyFromDate(today)
  const selectedDateKey = selectedDate ? dateKeyFromDate(selectedDate) : null
  const visibleDateKey = activeView === 'today' ? todayKey : selectedDateKey
  const selectedLabel = activeProfile ? `${activeProfile.label} · ${activeProfile.tone}` : ''
  const eventCount = events.length
  const hasSession = Boolean(sessionUser)
  const surfaceTitle = activeView === 'today' ? 'Aujourd’hui' : 'Calendrier'
  const surfaceDescription = activeView === 'today' ? 'Vue rapide, optimisée pour le pouce.' : 'Navigation précise, pensée mobile-first.'

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

    return () => {
      mounted = false
    }
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionUser, visibleDateKey])

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
    setEventDialogOpen(true)
  }

  const openEditDialog = (event: TrackyEvent) => {
    setEditingEventId(event.id)
    setEditingEventDateKey(event.created_at ? dateKeyFromDate(new Date(event.created_at)) : visibleDateKey)
    setEventTitle(event.title)
    setEventTime(formatEventTime(event.created_at))
    setEventDialogOpen(true)
  }

  const refetchVisibleEvents = async () => {
    if (!sessionUser || !visibleDateKey) return
    const list = await fetchEventsByDate(sessionUser.id, visibleDateKey)
    setEvents(list)
  }

  const eventLabel = activeView === 'today' ? 'Événements d’aujourd’hui' : 'Événements du jour'

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-3 text-foreground sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="tracky-float absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.20),transparent_70%)] blur-3xl" />
        <div className="tracky-float absolute right-[-4rem] top-24 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.18),transparent_70%)] blur-3xl [animation-delay:1.5s]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 shadow-[0_30px_100px_rgba(2,6,23,0.5)] backdrop-blur-2xl sm:min-h-[calc(100vh-3rem)]">
        <section className="space-y-6 p-4 pb-32 sm:p-6 sm:pb-32">
          <header className="flex items-start justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.7rem] uppercase tracking-[0.28em] text-cyan-200/90 shadow-[0_8px_30px_rgba(15,23,42,0.18)]">
              <Sparkles className="size-3.5 text-cyan-300" />
              Tracky
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 shadow-sm backdrop-blur">
                Duo privé
              </div>
              {hasSession ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="rounded-full border border-white/10 bg-white/5 px-3 text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="mr-2 size-3.5" />
                  Sortie
                </Button>
              ) : null}
            </div>
          </header>

          {sessionEmail ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 shadow-sm">
              <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.5)]" />
              <span className="truncate">{sessionEmail}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">Aujourd’hui</p>
              <p className="mt-1 text-sm font-medium text-slate-50">{formatReadableDate(today)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">Vue active</p>
              <p className="mt-1 text-sm font-medium text-slate-50">{surfaceTitle}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm">
              <p className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-400">Realtime</p>
              <p className="mt-1 text-sm font-medium text-slate-50">{hasSession ? `${eventCount} événement${eventCount > 1 ? 's' : ''}` : 'Accès privé'}</p>
            </div>
          </div>

          {hasSession ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-[1.6rem] border border-white/10 bg-white/5 p-2 shadow-sm">
                <Button
                  variant={activeView === 'calendar' ? 'default' : 'ghost'}
                  onClick={() => setActiveView('calendar')}
                  className={`rounded-[1.2rem] px-4 py-5 text-sm ${activeView === 'calendar' ? 'shadow-[0_12px_28px_rgba(13,148,136,0.28)]' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  <CalendarDays className="mr-2 size-4" />
                  Calendrier
                </Button>
                <Button
                  variant={activeView === 'today' ? 'default' : 'ghost'}
                  onClick={() => setActiveView('today')}
                  className={`rounded-[1.2rem] px-4 py-5 text-sm ${activeView === 'today' ? 'shadow-[0_12px_28px_rgba(13,148,136,0.28)]' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  <Clock3 className="mr-2 size-4" />
                  Aujourd’hui
                </Button>
              </div>

              <div className="rounded-[1.8rem] border border-white/10 bg-white/5 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.22)]">
                {activeView === 'calendar' ? (
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date: Date | undefined) => setSelectedDate(date)}
                    locale={fr}
                    className="w-full rounded-[1.4rem] border border-white/10 bg-slate-950/80 p-3 shadow-none"
                  />
                ) : (
                  <div className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(160deg,rgba(45,212,191,0.12),rgba(15,23,42,0.35))] p-4">
                    <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">{surfaceTitle}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-50">{formatReadableDate(today)}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{surfaceDescription} Accès direct aux actions du jour, sans friction inutile.</p>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <h3 className="text-slate-200">{eventLabel}</h3>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.72rem] text-slate-300">
                    {eventCount} élément{eventCount > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2">
                  {events.length === 0 ? (
                    <div className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4 text-sm text-slate-400 shadow-sm">
                      Aucun événement pour cette date.
                    </div>
                  ) : (
                    events.map((ev, index) => (
                      <div
                        key={ev.id}
                        className="group tracky-rise rounded-[1.35rem] border border-white/10 bg-white/5 p-3 shadow-[0_10px_30px_rgba(2,6,23,0.16)] transition-transform duration-300 hover:-translate-y-0.5"
                        style={{ animationDelay: `${index * 45}ms` }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-cyan-400/15 px-2.5 py-1 text-[0.72rem] font-medium text-cyan-100 ring-1 ring-cyan-300/20">
                                {formatEventTime(ev.created_at)}
                              </span>
                              <span className="text-[0.7rem] uppercase tracking-[0.24em] text-slate-400">
                                {dateKeyFromDate(new Date(ev.created_at ?? today.toISOString())) === todayKey ? 'Aujourd’hui' : 'Planifié'}
                              </span>
                            </div>
                            <div className="truncate text-sm font-medium text-slate-50">{ev.title}</div>
                            <div className="text-xs text-slate-400">Synchronisé via Supabase Realtime</div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="rounded-full text-slate-300 hover:bg-cyan-400/10 hover:text-cyan-200" onClick={() => openEditDialog(ev)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-slate-300 hover:bg-rose-400/10 hover:text-rose-200"
                              onClick={async () => {
                                await deleteEvent(ev.id)
                                await refetchVisibleEvents()
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.22)]">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Accès privé</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-50">Choisis un profil pour ouvrir la PWA.</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  La connexion se fait par PIN, dans une interface pensée pour être rapide au pouce et rassurante visuellement.
                </p>
              </div>

              <div className="grid gap-3">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => openProfile(profile)}
                    className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/5 p-4 text-left shadow-[0_20px_45px_rgba(2,6,23,0.22)] transition-transform duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${profile.accent} opacity-80 transition-opacity duration-300 group-hover:opacity-100`} />
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-200/80">{profile.label}</p>
                        <p className="text-lg font-medium text-white">{profile.tone}</p>
                        <p className="text-sm text-slate-200/80">{profile.email}</p>
                      </div>
                      <div className="flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/40 text-white shadow-sm backdrop-blur">
                        <Users className="size-5" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="border-t border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300 shadow-sm">
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="size-4 text-cyan-300" />
              Connexion PIN privée
            </span>
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Supabase Auth</span>
          </div>
        </section>
      </div>

      {hasSession ? (
        <div>
          <div className="fixed bottom-24 left-0 right-0 z-50 flex items-center justify-center sm:bottom-28">
            <button
              onClick={openCreateDialog}
              className="inline-flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(45,212,191,1),rgba(8,145,178,1))] text-white shadow-[0_18px_50px_rgba(8,145,178,0.35)] transition-transform duration-300 hover:scale-105 active:scale-95"
              aria-label="Ajouter événement"
            >
              <Plus className="size-7" />
            </button>
          </div>

          <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/80 p-3 backdrop-blur-2xl">
            <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-2 shadow-[0_20px_50px_rgba(2,6,23,0.24)]">
              <Button
                variant={activeView === 'calendar' ? 'default' : 'ghost'}
                onClick={() => setActiveView('calendar')}
                className="h-11 flex-1 rounded-[1.1rem] text-slate-100"
              >
                Calendrier
              </Button>
              <Button
                variant={activeView === 'today' ? 'default' : 'ghost'}
                onClick={() => setActiveView('today')}
                className="h-11 flex-1 rounded-[1.1rem] text-slate-100"
              >
                Aujourd'hui
              </Button>
              <Button variant="ghost" onClick={handleSignOut} className="h-11 rounded-[1.1rem] px-4 text-slate-200 hover:bg-white/10 hover:text-white">
                Sortie
              </Button>
            </div>
          </nav>
        </div>
      ) : null}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="border-white/10 bg-slate-950/95 text-slate-100 shadow-[0_-30px_100px_rgba(2,6,23,0.6)]">
          <DrawerHeader className="p-4 text-left">
            <DrawerTitle className="text-lg text-white">{selectedLabel || 'Connexion'}</DrawerTitle>
            <DrawerDescription className="text-slate-400">Saisis le code PIN associé au profil pour ouvrir Tracky.</DrawerDescription>
          </DrawerHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <label htmlFor="pin" className="text-xs uppercase tracking-[0.24em] text-slate-400">
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
                className="h-12 rounded-2xl border-white/10 bg-white/5 text-base tracking-[0.35em] text-white placeholder:tracking-[0.15em] placeholder:text-slate-500 focus-visible:ring-cyan-400/30"
              />
            </div>

            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}

            <DrawerFooter className="px-0 pb-0">
              <Button type="submit" className="h-12 rounded-2xl shadow-[0_14px_35px_rgba(8,145,178,0.25)]" disabled={isSigningIn || pin.length === 0}>
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

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-md border-white/10 bg-slate-950/95 text-slate-100 shadow-[0_24px_100px_rgba(2,6,23,0.65)]">
          <DialogHeader>
            <DialogTitle className="text-white">{editingEventId ? 'Modifier l’événement' : 'Nouvel événement'}</DialogTitle>
            <DialogDescription className="text-slate-400">Ajoute un titre et une heure pour garder la vue claire sur mobile.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs text-slate-400">Titre</label>
            <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Titre de l'événement" className="h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus-visible:ring-cyan-400/30" />
            <label className="text-xs text-slate-400">Heure</label>
            <Input value={eventTime} onChange={(e) => setEventTime(e.target.value)} type="time" className="h-11 w-full rounded-2xl border-white/10 bg-white/5 text-white focus-visible:ring-cyan-400/30" />
          </div>

          <DialogFooter className="border-white/10 bg-white/5">
            <Button variant="outline" onClick={() => setEventDialogOpen(false)} className="border-white/10 bg-transparent text-slate-200 hover:bg-white/10">
              Annuler
            </Button>
            <Button
              onClick={async () => {
                const targetDateKey = editingEventId ? editingEventDateKey ?? visibleDateKey : visibleDateKey
                if (!sessionUser || !targetDateKey) return

                if (editingEventId) {
                  await updateEvent(editingEventId, eventTitle || 'Nouvel événement', targetDateKey, eventTime)
                } else {
                  await createEvent(sessionUser.id, eventTitle || 'Nouvel événement', targetDateKey, eventTime)
                }

                await refetchVisibleEvents()
                setEventTitle('')
                setEventTime('12:00')
                setEditingEventId(null)
                setEditingEventDateKey(null)
                setEventDialogOpen(false)
              }}
            >
              {editingEventId ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

export default App
