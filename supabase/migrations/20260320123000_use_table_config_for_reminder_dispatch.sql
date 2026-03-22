/*
  # Use table-based scheduler config

  ## Why
  Some roles cannot execute `ALTER DATABASE ... SET app.settings.*`.
  This migration moves reminder dispatcher configuration to a regular table
  so it can be updated without database-owner privileges.
*/

create table if not exists public.app_runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_runtime_config enable row level security;

drop policy if exists "Service role manages app runtime config" on public.app_runtime_config;
create policy "Service role manages app runtime config"
  on public.app_runtime_config for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists update_app_runtime_config_updated_at on public.app_runtime_config;
create trigger update_app_runtime_config_updated_at
  before update on public.app_runtime_config
  for each row
  execute function public.update_updated_at_column();

create or replace function public.invoke_send_reminder()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_token text;
begin
  select value into v_url
  from public.app_runtime_config
  where key = 'send_reminder_url';

  select value into v_token
  from public.app_runtime_config
  where key = 'send_reminder_token';

  -- Backward compatibility if DB-level settings exist
  if coalesce(v_url, '') = '' then
    v_url := current_setting('app.settings.send_reminder_url', true);
  end if;
  if coalesce(v_token, '') = '' then
    v_token := current_setting('app.settings.send_reminder_token', true);
  end if;

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
