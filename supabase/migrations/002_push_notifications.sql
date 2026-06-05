-- Add notification tracking to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notification_offset_minutes INTEGER NOT NULL DEFAULT 15;

-- Push subscriptions per device
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_own"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function called by the edge function every minute to find events to notify.
-- Returns events where the notification window (start_date - offset) falls within the last 2 minutes.
CREATE OR REPLACE FUNCTION public.get_events_to_notify()
RETURNS TABLE (id uuid, user_id uuid, title text, start_date timestamptz, notification_offset_minutes integer)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT id, user_id, title, start_date, notification_offset_minutes
  FROM public.events
  WHERE notified_at IS NULL
    AND start_date > NOW()
    AND (start_date - notification_offset_minutes * INTERVAL '1 minute') <= NOW()
    AND (start_date - notification_offset_minutes * INTERVAL '1 minute') > NOW() - INTERVAL '2 minutes';
$$;
