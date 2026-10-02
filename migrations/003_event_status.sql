-- Estado propio del evento para poder marcar como terminado incluso sin subtareas.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

NOTIFY pgrst, 'reload schema';
