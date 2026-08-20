-- ============================================================
-- Key Generator Function
-- Generates a random API key, hashes it, stores only the hash,
-- and returns the RAW key exactly once to the caller.
-- ============================================================

create or replace function generate_api_key(key_name text)
returns text
language plpgsql
security definer
as $$
declare
  raw_key text;
  hashed text;
  prefix text;
begin
  -- generate a random key like sk_live_xxxxxxxxxxxx
  raw_key := 'sk_live_' || encode(gen_random_bytes(24), 'hex');
  prefix := left(raw_key, 14);
  hashed := encode(digest(raw_key, 'sha256'), 'hex');

  insert into api_keys (user_id, name, key_hash, key_prefix)
  values (auth.uid(), key_name, hashed, prefix);

  return raw_key; -- only returned here, never stored
end;
$$;

-- ============================================================
-- Usage (run in SQL Editor, or call via supabase.rpc() from your app):
--   select generate_api_key('my test key');
-- ============================================================
