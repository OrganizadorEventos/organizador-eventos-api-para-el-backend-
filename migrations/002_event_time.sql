-- Hora opcional para cada evento.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_time text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
