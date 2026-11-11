# Lock-in

Personal training app: the plan, a daily check-in, a workout logger, a dashboard, and a coach you can chat with.
Hebrew, RTL, installable on iPhone from Safari (Share → Add to Home Screen).

- **Daily questions.** At 18:30 a push asks whether you're going and which workout. At 20:30 it asks how it went,
  or follows up if you never answered. Times are set in Settings.
- **Coach.** Chat backed by an OpenAI-compatible model (default `gpt-6-luna`). It sees the plan, the last weeks of
  check-ins, logged sets and metrics, and the facts it saved about you. It can change the plan, log days and numbers,
  and save or forget facts.
- **Dashboard.** Sessions this week and the week streak, 12-week history, jump and strength tests, top sets per lift,
  sleep and energy, and why sessions were skipped.

## Stack
- Vite + React + TypeScript, hosted on GitHub Pages.
- Supabase: Postgres with RLS, Auth (email + password), Edge Functions (`coach`, `notify`), pg_cron every 10 min.
- Web Push (VAPID). iOS needs 16.4+ and the app opened from the home-screen icon.

## Deploy
Everything deploys from `.github/workflows/deploy.yml` on every push to `main`.
Repository secrets:

| Secret | What |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | The project id from its URL |
| `OPENAI_API_KEY` | For the coach |

The workflow applies `supabase/migrations` through the Management API, pushes auth settings from
`supabase/config.toml`, creates VAPID keys once, sets the secrets, deploys the functions, and builds the site.
Optional function secrets: `OPENAI_MODEL`, `OPENAI_FALLBACK_MODEL`, `OPENAI_BASE_URL`.

The first account created is the owner; only the owner can use the coach. After signing up, turn off
"Allow new users to sign up" in Supabase → Authentication.

## Local
```
npm install
npm run dev        # open /demo.html for a preview with fake data
```
