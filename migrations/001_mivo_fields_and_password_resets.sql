-- MIVO: campos adicionales para actividades y restablecimiento seguro de contraseñas.
-- Ejecutar en el SQL Editor de Supabase una sola vez.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS course text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS weight numeric(5,2),
  ADD COLUMN IF NOT EXISTS event_time text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON public.password_reset_tokens(user_id, expires_at DESC);

NOTIFY pgrst, 'reload schema';
