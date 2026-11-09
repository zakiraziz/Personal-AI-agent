create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.youtube_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  youtube_channel_id text not null,
  channel_name text not null,
  description text not null default '',
  custom_url text,
  thumbnail_url text,
  country_code text check (country_code is null or char_length(country_code) = 2),
  published_at timestamptz,
  subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
  hidden_subscriber_count boolean not null default false,
  view_count bigint check (view_count is null or view_count >= 0),
  video_count bigint check (video_count is null or video_count >= 0),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, youtube_channel_id),
  unique (owner_id, id)
);

create table public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  channel_id uuid not null,
  youtube_video_id text not null,
  title text not null,
  description text not null default '',
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  privacy_status text check (
    privacy_status is null
    or privacy_status in ('public', 'unlisted', 'private')
  ),
  view_count bigint check (view_count is null or view_count >= 0),
  like_count bigint check (like_count is null or like_count >= 0),
  comment_count bigint check (comment_count is null or comment_count >= 0),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, channel_id)
    references public.youtube_channels (owner_id, id)
    on delete cascade,
  unique (owner_id, youtube_video_id)
);

create table public.youtube_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  channel_id uuid not null,
  youtube_playlist_id text not null,
  title text not null,
  description text not null default '',
  thumbnail_url text,
  published_at timestamptz,
  item_count integer check (item_count is null or item_count >= 0),
  privacy_status text check (
    privacy_status is null
    or privacy_status in ('public', 'unlisted', 'private')
  ),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, channel_id)
    references public.youtube_channels (owner_id, id)
    on delete cascade,
  unique (owner_id, youtube_playlist_id)
);

create table public.youtube_analytics_daily (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  channel_id uuid not null,
  report_date date not null,
  views bigint check (views is null or views >= 0),
  watch_time_minutes numeric(14, 2)
    check (watch_time_minutes is null or watch_time_minutes >= 0),
  average_view_duration_seconds numeric(14, 2)
    check (average_view_duration_seconds is null or average_view_duration_seconds >= 0),
  subscribers_gained integer
    check (subscribers_gained is null or subscribers_gained >= 0),
  subscribers_lost integer
    check (subscribers_lost is null or subscribers_lost >= 0),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (owner_id, channel_id)
    references public.youtube_channels (owner_id, id)
    on delete cascade,
  unique (owner_id, channel_id, report_date)
);

create table private.youtube_oauth_tokens (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  google_email text,
  refresh_token_ciphertext text not null,
  encryption_key_version smallint not null default 1
    check (encryption_key_version > 0),
  granted_scopes text[] not null default '{}',
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column private.youtube_oauth_tokens.refresh_token_ciphertext is
  'Application-encrypted Google OAuth refresh token; plaintext tokens must never be stored.';

create index youtube_channels_owner_idx
  on public.youtube_channels (owner_id);
create index youtube_videos_owner_channel_published_idx
  on public.youtube_videos (owner_id, channel_id, published_at desc);
create index youtube_playlists_owner_channel_idx
  on public.youtube_playlists (owner_id, channel_id);
create index youtube_analytics_daily_owner_channel_date_idx
  on public.youtube_analytics_daily (owner_id, channel_id, report_date desc);

alter table public.youtube_channels enable row level security;
alter table public.youtube_videos enable row level security;
alter table public.youtube_playlists enable row level security;
alter table public.youtube_analytics_daily enable row level security;
alter table private.youtube_oauth_tokens enable row level security;

create policy "Authorized users can read their YouTube channels"
on public.youtube_channels for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
);

create policy "Authorized users can read their YouTube videos"
on public.youtube_videos for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
);

create policy "Authorized users can read their YouTube playlists"
on public.youtube_playlists for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
);

create policy "Authorized users can read their YouTube analytics"
on public.youtube_analytics_daily for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select public.is_authorized_user())
);

revoke all on table
  public.youtube_channels,
  public.youtube_videos,
  public.youtube_playlists,
  public.youtube_analytics_daily
from public, anon, authenticated;

grant select on table
  public.youtube_channels,
  public.youtube_videos,
  public.youtube_playlists,
  public.youtube_analytics_daily
to authenticated;

grant select, insert, update, delete on table
  public.youtube_channels,
  public.youtube_videos,
  public.youtube_playlists,
  public.youtube_analytics_daily
to service_role;

revoke all on table private.youtube_oauth_tokens
from public, anon, authenticated;

grant select, insert, update, delete
on table private.youtube_oauth_tokens
to service_role;

create trigger youtube_channels_set_updated_at
before update on public.youtube_channels
for each row execute function public.set_updated_at();

create trigger youtube_videos_set_updated_at
before update on public.youtube_videos
for each row execute function public.set_updated_at();

create trigger youtube_playlists_set_updated_at
before update on public.youtube_playlists
for each row execute function public.set_updated_at();

create trigger youtube_oauth_tokens_set_updated_at
before update on private.youtube_oauth_tokens
for each row execute function public.set_updated_at();
