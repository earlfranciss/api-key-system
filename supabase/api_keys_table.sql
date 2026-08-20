-- ============================================================
-- API Keys Table
-- Stores only a HASH of each API key, never the raw key itself.
-- ============================================================

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  key_hash text not null,       -- SHA-256 hash of the real key
  key_prefix text not null,     -- e.g. "sk_live_1a2b" — safe to show in UI
  created_at timestamptz default now(),
  last_used_at timestamptz
);

-- Row Level Security: users can only see/manage their own keys
alter table api_keys enable row level security;

create policy "Users can view their own keys"
  on api_keys for select
  using (auth.uid() = user_id);

create policy "Users can delete their own keys"
  on api_keys for delete
  using (auth.uid() = user_id);
