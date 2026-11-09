create extension if not exists pgtap with schema extensions;

begin;

select plan(10);

insert into public.authorized_users (email)
values
  ('youtube-owner@example.test'),
  ('youtube-other@example.test');

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    'f5931b77-12be-48ae-977e-5feac3f870a3',
    'authenticated',
    'authenticated',
    'youtube-owner@example.test',
    'test-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  ),
  (
    '439531a5-d383-4843-99f9-d2ef6bf163e5',
    'authenticated',
    'authenticated',
    'youtube-other@example.test',
    'test-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  );

insert into public.youtube_channels (
  id, owner_id, youtube_channel_id, channel_name
)
values (
  '47ea31f3-058a-423b-b1b4-145609ff98e2',
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  'UC-noobitoon-test',
  'Owner channel'
);

insert into public.youtube_videos (
  owner_id, channel_id, youtube_video_id, title
)
values (
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  '47ea31f3-058a-423b-b1b4-145609ff98e2',
  'video-owner-test',
  'Owner video'
);

insert into public.youtube_playlists (
  owner_id, channel_id, youtube_playlist_id, title
)
values (
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  '47ea31f3-058a-423b-b1b4-145609ff98e2',
  'playlist-owner-test',
  'Owner playlist'
);

insert into public.youtube_analytics_daily (
  owner_id, channel_id, report_date, views
)
values (
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  '47ea31f3-058a-423b-b1b4-145609ff98e2',
  current_date,
  42
);

insert into private.youtube_oauth_tokens (
  owner_id, refresh_token_ciphertext
)
values (
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  'test-encrypted-token'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"f5931b77-12be-48ae-977e-5feac3f870a3","role":"authenticated","email":"youtube-owner@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  'f5931b77-12be-48ae-977e-5feac3f870a3',
  true
);

select is((select count(*) from public.youtube_channels), 1::bigint, 'owner can read their channel');
select is((select count(*) from public.youtube_videos), 1::bigint, 'owner can read their videos');
select is((select count(*) from public.youtube_playlists), 1::bigint, 'owner can read their playlists');
select is((select count(*) from public.youtube_analytics_daily), 1::bigint, 'owner can read their analytics');

select set_config(
  'request.jwt.claims',
  '{"sub":"439531a5-d383-4843-99f9-d2ef6bf163e5","role":"authenticated","email":"youtube-other@example.test"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '439531a5-d383-4843-99f9-d2ef6bf163e5',
  true
);

select is((select count(*) from public.youtube_channels), 0::bigint, 'another user cannot read the channel');
select is((select count(*) from public.youtube_videos), 0::bigint, 'another user cannot read the videos');
select is((select count(*) from public.youtube_playlists), 0::bigint, 'another user cannot read the playlists');
select is((select count(*) from public.youtube_analytics_daily), 0::bigint, 'another user cannot read the analytics');

select throws_ok(
  $$insert into public.youtube_channels (owner_id, youtube_channel_id, channel_name)
    values (auth.uid(), 'UC-direct-write-test', 'Direct write')$$,
  '42501',
  null,
  'authenticated users cannot write synchronized channel data'
);
select throws_ok(
  $$select * from private.youtube_oauth_tokens$$,
  '42501',
  null,
  'authenticated users cannot read OAuth tokens'
);

select * from finish();
rollback;
