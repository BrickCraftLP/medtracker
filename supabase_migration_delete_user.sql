-- ============================================================
-- MedTracker — Delete user account RPC
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor)
--
-- SECURITY DEFINER runs as the function owner (postgres superuser)
-- which has DELETE on auth.users. The calling user is identified
-- via auth.uid() so they can only ever delete themselves.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.exercises      WHERE user_id = uid;
  DELETE FROM public.sessions       WHERE user_id = uid;
  DELETE FROM public.todos          WHERE user_id = uid;
  DELETE FROM public.topics         WHERE user_id = uid;
  DELETE FROM public.widget_configs WHERE user_id = uid;
  -- pin_config may not exist in all deployments; skip safely
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pin_config'
  ) THEN
    EXECUTE 'DELETE FROM public.pin_config WHERE user_id = $1' USING uid;
  END IF;
  DELETE FROM public.profiles       WHERE id       = uid;
  DELETE FROM auth.users            WHERE id       = uid;
END;
$$;

-- Only authenticated users can invoke this function
REVOKE ALL ON FUNCTION delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;
