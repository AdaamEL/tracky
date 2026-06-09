ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

-- Index for recurring event groups
CREATE INDEX IF NOT EXISTS idx_events_recurrence_group
  ON public.events (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- Indexes for start/end date range overlap queries (multi-day events + calendar dots)
CREATE INDEX IF NOT EXISTS idx_events_start_date ON public.events (user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_events_end_date ON public.events (user_id, end_date);

-- Backfill: ensure existing events have end_date set (previously may have been null)
UPDATE public.events SET end_date = start_date WHERE end_date IS NULL AND start_date IS NOT NULL;
