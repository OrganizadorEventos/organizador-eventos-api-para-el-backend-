-- Garantiza que finalizar eventos quede guardado y que eliminarlos también
-- quite sus subtareas, incluso en bases creadas con un esquema anterior.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

UPDATE public.events SET status = 'pending' WHERE status IS NULL;
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.events ALTER COLUMN status SET NOT NULL;

DO $$
DECLARE
  existing_constraint record;
BEGIN
  FOR existing_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_attribute AS event_id_column
      ON event_id_column.attrelid = constraint_row.conrelid
     AND event_id_column.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.contype = 'f'
      AND constraint_row.conrelid = 'public.tasks'::regclass
      AND constraint_row.confrelid = 'public.events'::regclass
      AND event_id_column.attname = 'event_id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.tasks DROP CONSTRAINT %I',
      existing_constraint.conname
    );
  END LOOP;

  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
END $$;

NOTIFY pgrst, 'reload schema';
