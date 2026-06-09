ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_events_recurrence_group
  ON public.events (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;
