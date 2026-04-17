-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,          -- unique ID sent to Lenco per transaction
  plan text not null,                      -- 'basic' | 'pro' | 'max'
  account_type text not null,              -- 'student' | 'professional' | 'business'
  amount_zmw numeric(10, 2),
  status text not null default 'pending',  -- 'pending' | 'successful' | 'failed'
  operator text,                           -- 'MTN' | 'Airtel' (populated after verification)
  lenco_reference text,                    -- Lenco's own internal reference
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups by reference (used in verify route)
create index if not exists payments_reference_idx on payments(reference);

-- Index for user payment history
create index if not exists payments_user_id_idx on payments(user_id);

-- Auto-update updated_at on every row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payments_updated_at
  before update on payments
  for each row execute function update_updated_at();

-- RLS: users can only read their own payment rows
alter table payments enable row level security;

create policy "Users can view own payments"
  on payments for select
  using (auth.uid() = user_id);

-- Service role (used by your API routes) bypasses RLS automatically
