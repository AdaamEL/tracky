-- Drop push notification infrastructure (replaced by email)
DROP TABLE IF EXISTS public.push_subscriptions;

-- Drop first because the return type changes (new user_email column)
DROP FUNCTION IF EXISTS public.get_events_to_notify();

CREATE OR REPLACE FUNCTION public.get_events_to_notify()
RETURNS TABLE (
  id                          uuid,
  user_id                     uuid,
  title                       text,
  start_date                  timestamptz,
  notification_offset_minutes integer,
  user_email                  text
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    e.id,
    e.user_id,
    e.title,
    e.start_date,
    e.notification_offset_minutes,
    u.email
  FROM public.events e
  JOIN auth.users u ON u.id = e.user_id
  WHERE e.notified_at IS NULL
    AND e.start_date > NOW()
    AND (e.start_date - e.notification_offset_minutes * INTERVAL '1 minute') <= NOW()
    AND (e.start_date - e.notification_offset_minutes * INTERVAL '1 minute') > NOW() - INTERVAL '2 minutes';
$$;
