create table if not exists labels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  artist_name text,
  name        text not null,
  tagline     text,
  genre       text[] default '{}',
  logo_url         text,
  career_stage     text,
  long_term_goals  text[] default '{}',
  created_at       timestamptz default now()
);

-- Each user has exactly one label
create unique index if not exists labels_user_id_idx on labels(user_id);

-- Row-level security
alter table labels enable row level security;

create policy "Users can read their own label"
  on labels for select
  using (auth.uid() = user_id);

create policy "Users can insert their own label"
  on labels for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own label"
  on labels for update
  using (auth.uid() = user_id);

-- Storage bucket for logos (run after creating the bucket named "logos" in the dashboard)
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true);

create policy "Users can upload their own logo"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'logos');

-- AI Conversations
create table if not exists ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  agent_type text not null,
  messages   jsonb default '[]',
  updated_at timestamptz default now()
);

create unique index if not exists ai_conversations_user_agent_idx
  on ai_conversations(user_id, agent_type);

alter table ai_conversations enable row level security;

create policy "Users can read their own conversations"
  on ai_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on ai_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on ai_conversations for update
  using (auth.uid() = user_id);

-- Rollouts
create table if not exists rollouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  release_title text not null,
  release_type  text,
  drop_date     date,
  artwork_url   text,
  audio_url     text,
  goals         text[] default '{}',
  platforms     text[] default '{}',
  plan          jsonb,
  created_at    timestamptz default now()
);

alter table rollouts enable row level security;

create policy "Users can read their own rollouts"
  on rollouts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rollouts"
  on rollouts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rollouts"
  on rollouts for update
  using (auth.uid() = user_id);
