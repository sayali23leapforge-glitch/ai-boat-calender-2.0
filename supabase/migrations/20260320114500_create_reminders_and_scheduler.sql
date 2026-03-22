/*
  # Adaptive Gmail reminders

  ## Summary
  - Creates `reminders` queue table for scheduled email notifications.
  - Adds `reminder_prefs` memory field to `user_preferences`.
  - Adds a cron-invoked dispatcher using `pg_cron` + `pg_net`.

  ## Runtime config required
  Configure these Postgres settings in Supabase SQL editor:

    alter database postgres set app.settings.send_reminder_url = 'https://ofkthnxcfkdtnrxgrbnq.supabase.co/functions/v1/send-reminder';
    alter database postgres set app.settings.send_reminder_token = 'sbp_cc600161bbbf5265b96009bbfd86643a3bf16dea';

  The cron job runs every minute and invokes the edge function.
*/

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  channel text not null default 'GMAIL' check (channel in ('GMAIL')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  importance_level smallint check (importance_level between 1 and 3),
  importance_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminders_user_id on public.reminders(user_id);
create index if not exists idx_reminders_status_scheduled on public.reminders(status, scheduled_at);
create index if not exists idx_reminders_task_id on public.reminders(task_id);

alter table public.reminders enable row level security;

drop policy if exists "Users can read own reminders" on public.reminders;
create policy "Users can read own reminders"
  on public.reminders for select
  to authenticated
  using (auth.uid()::text = user_id);

drop policy if exists "Service role manages reminders" on public.reminders;
create policy "Service role manages reminders"
  on public.reminders for all
  to service_role
  using (true)
  with check (true);

alter table public.user_preferences
  add column if not exists reminder_prefs text default '';

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'update_updated_at_column'
  ) then
    create function public.update_updated_at_column()
    returns trigger as $func$
    begin
      new.updated_at = now();
      return new;
    end;
    $func$ language plpgsql;
  end if;
end $$;

drop trigger if exists update_reminders_updated_at on public.reminders;
create trigger update_reminders_updated_at
  before update on public.reminders
  for each row
  execute function public.update_updated_at_column();

create or replace function public.invoke_send_reminder()
returns void
language plpgsql
security definer
as $$
declare
  v_url text := current_setting('app.settings.send_reminder_url', true);
  v_token text := current_setting('app.settings.send_reminder_token', true);
begin
  if coalesce(v_url, '') = '' then
    raise notice 'send reminder URL is not configured';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_token, '')
    ),
    body := jsonb_build_object('batchSize', 25)::jsonb
  );
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'send-reminder-every-minute'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'send-reminder-every-minute',
    '* * * * *',
    'select public.invoke_send_reminder();'
  );
exception
  when undefined_table then
    -- pg_cron metadata table unavailable in local or unsupported env
    null;
end $$;
