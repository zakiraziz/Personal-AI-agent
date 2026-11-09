# Phase 02: YouTube integration

The migration `202611100001_youtube_integration_schema.sql` adds owner-scoped
channel, video, playlist, and daily analytics tables, plus the private OAuth
token table. Apply it after the existing migrations before testing the OAuth
routes. It has not been applied to a remote Supabase project yet.

The Supabase API schema configuration includes `private` so the server-side
service-role client can access the token table locally. For a hosted project,
also add `private` under **Project Settings → API → Exposed schemas**, then
reload the schema cache if prompted. The migration revokes schema and table
access from `anon` and `authenticated`; only `service_role` receives access to
the private token table. Keep the service role key server-only. Until the
hosted API exposes `private`, the callback cannot read or save OAuth tokens.

Set these server-only values in the repository-root `.env.local` (the same
directory where you run `npm run dev`) before testing Google OAuth:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: credentials for the Google
  OAuth web application.
- `GOOGLE_REDIRECT_URI`: the exact callback URI registered with Google,
  `${NEXT_PUBLIC_SITE_URL}/api/youtube/callback`.
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key used only by
  authenticated server routes.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: a securely generated, base64-encoded
  32-byte key for encrypting refresh tokens before they are stored.

Do not use a `NEXT_PUBLIC_` prefix for secrets, commit `.env.local`, or store
plaintext refresh tokens. `GET /api/youtube/connect` requires an authorized
signed-in user and starts the Google consent flow with a short-lived,
HMAC-signed state parameter bound to that user. `GET /api/youtube/callback`
validates the signature, expiration, and signed-in user before exchanging the
code, storing the encrypted refresh token in the private table, and upserting
the user's YouTube channel information. No state cookie is required.

The callback requests the YouTube read-only, OpenID, and email scopes. If
Google does not issue a refresh token for an existing connection, the route
retains the previously encrypted token; if there is no previous token, revoke
this app's Google account access and connect again.

The dashboard loads the signed-in user's channel summary through Supabase RLS.
Disconnect removes the locally stored refresh token and channel records (and
channel-owned records that cascade from them). It does not revoke the Google
account grant; remove that separately from Google Account security settings if
needed.

## Phase 03: Sync engine

The `POST /api/youtube/sync` route refreshes the stored Google token, syncs
playlists and uploaded video details, and imports the previous 30 complete UTC
days from YouTube Analytics. The account must have consented to
`youtube.readonly` and `yt-analytics.readonly`; use Connect YouTube again to
grant the added Analytics scope. Enable **YouTube Analytics API** in the Google
Cloud project as well as **YouTube Data API v3**.

The Sync Now control reports the number of playlists, videos, and analytics
days upserted, then refreshes the dashboard. Recent Content and Views over time
read owner-scoped rows from `youtube_videos` and `youtube_analytics_daily`.
