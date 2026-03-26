/*
  Expand reminders into timeline-wide alerts.
  - Supports TASK / EVENT / GOAL entities
  - Supports RELATED_QUESTION alerts
  - Keeps backward compatibility with existing task reminders
*/

alter table public.reminders
  alter column task_id drop not null;

alter table public.reminders
  add column if not exists entity_type text not null default 'TASK',
  add column if not exists entity_id text,
  add column if not exists alert_kind text not null default 'REMINDER';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reminders_entity_type_check'
  ) then
    alter table public.reminders
      add constraint reminders_entity_type_check
      check (entity_type in ('TASK', 'EVENT', 'GOAL', 'QUESTION'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reminders_alert_kind_check'
  ) then
    alter table public.reminders
      add constraint reminders_alert_kind_check
      check (alert_kind in ('REMINDER', 'RELATED_QUESTION'));
  end if;
end $$;

update public.reminders
set entity_type = 'TASK',
    entity_id = coalesce(entity_id, task_id::text)
where task_id is not null
  and (entity_id is null or entity_id = '');

create index if not exists idx_reminders_entity_lookup
  on public.reminders(entity_type, entity_id, status, scheduled_at);

create unique index if not exists idx_reminders_entity_channel_scheduled_kind_unique
  on public.reminders(
    coalesce(entity_type, 'TASK'),
    coalesce(entity_id, task_id::text, ''),
    channel,
    scheduled_at,
    coalesce(alert_kind, 'REMINDER')
  );
