-- ================================================
-- Bill Splitter - Supabase Database Schema
-- ================================================

-- Drop existing tables (in reverse dependency order)
drop table if exists item_shares cascade;
drop table if exists items cascade;
drop table if exists participants cascade;
drop table if exists sessions cascade;

-- Generate a random 6-character alphanumeric code (ambiguity-safe: no 0/O/1/I/l)
create or replace function generate_session_code() returns text as $$
declare
  chars  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    -- ensure uniqueness
    exit when not exists (select 1 from sessions where sessions.code = result);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Sessions table
create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default generate_session_code(),
  tax_percent decimal not null default 0.13,
  -- Tip for the whole bill, set by the host (the first participant).
  -- 'percent' applies tip_percent to each person's pre-tax subtotal;
  -- 'amount' splits tip_amount in proportion to each person's subtotal.
  tip_mode text not null default 'percent' check (tip_mode in ('percent', 'amount')),
  tip_percent decimal check (tip_percent >= 0 and tip_percent <= 100),
  tip_amount decimal check (tip_amount >= 0),
  created_at timestamptz not null default now()
);

-- Participants in a session
create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  tip_percent integer default 0,  -- unused: tip now lives on sessions
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Items on the bill
create table items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  price decimal not null,
  qty integer not null default 1,
  created_at timestamptz not null default now()
);

-- Each participant's share of each item
create table item_shares (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  proportion decimal not null default 0,
  split_method text not null default 'qty' check (split_method in ('qty', 'percentage')),
  -- How the claim was entered (proportion stays the source of truth for totals):
  units_count integer check (units_count >= 0),       -- how many of the item
  split_ways integer check (split_ways >= 1),         -- people splitting them (1 = just me; null = custom percent)
  shares_covered integer check (shares_covered >= 1), -- shares of that split this person pays for
  unique (participant_id, item_id)
);

-- Live updates: everyone in a session sees items, claims, people and the tip change
alter publication supabase_realtime add table participants, items, item_shares, sessions;
