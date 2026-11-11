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
- Vite + React + TypeScript, served as static assets by a Cloudflare Worker.
- The same Worker is the API (`/api/*`): D1 (SQLite) database, email + password sign-in, the coach, and a cron
  trigger every 10 minutes that sends the daily questions.
- Web Push (VAPID) implemented with WebCrypto in `worker/src/webpush.ts`. iOS needs 16.4+ and the app opened from
  the home-screen icon.

## Deploy
`.github/workflows/deploy.yml` runs on every push to `main`. Repository secrets:

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token from the "Edit Cloudflare Workers" template, plus Account → D1 → Edit |
| `CLOUDFLARE_ACCOUNT_ID` | The account the app lives in. Use a separate account from anything else you run |
| `OPENAI_API_KEY` | For the coach |

The workflow creates the D1 database on first run, applies `worker/migrations`, deploys the Worker, creates VAPID
keys once, and sets the secrets. Optional Worker secrets: `OPENAI_MODEL`, `OPENAI_FALLBACK_MODEL`, `OPENAI_BASE_URL`.

The first account that signs up is the only one; sign-up closes after that.

## Local
```
npm install
npm run build && npx wrangler d1 migrations apply lock-in --local && npx wrangler dev
npm run dev        # UI only: open /demo.html for a preview with fake data
```
