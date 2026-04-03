create table if not exists public.ai_chat_conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_conversations_user_updated_idx
  on public.ai_chat_conversations (user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null references public.ai_chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  disambiguation jsonb null,
  message_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, message_index)
);

create index if not exists ai_chat_messages_user_conversation_idx
  on public.ai_chat_messages (user_id, conversation_id, message_index);
