-- Session-wide tip, set by the host (the first participant).
-- Additive only: the version of the app already deployed ignores these columns.

alter table sessions
  add column tip_mode text not null default 'percent' check (tip_mode in ('percent', 'amount')),
  add column tip_percent decimal check (tip_percent >= 0 and tip_percent <= 100),
  add column tip_amount decimal check (tip_amount >= 0);

-- Carry over existing sessions: the host (first participant) set the tip they paid
update sessions s
set tip_percent = first_p.tip_percent
from (
  select distinct on (session_id) session_id, tip_percent
  from participants
  order by session_id, created_at
) first_p
where first_p.session_id = s.id and first_p.tip_percent > 0;

-- Send live updates when the host changes the tip
alter publication supabase_realtime add table sessions;
