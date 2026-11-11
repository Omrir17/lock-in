# Handoff: Lock-in

Personal training PWA: plan, daily check-in, workout logger, dashboard, AI coach, push questions at 18:30 / 20:30.
Hebrew, RTL, installed on an iPhone from Safari. One user (the owner).

## Where things stand
- Code is complete and pushed to `main`. The backend was first built on Supabase, then moved to Cloudflare
  because the Supabase free-project limit was reached (commit "Move the backend from Supabase to a Cloudflare Worker with D1").
- **Blocker:** the deploy workflow (`.github/workflows/deploy.yml`) has never run. Runs are stuck in *queued*
  (two runs, 20+ min). Cause unknown: check the Actions tab for an approval prompt or disabled workflows,
  cancel the old run, re-run "Deploy Lock-in" (workflow_dispatch), then watch the logs and fix what fails.
- Nothing is deployed yet. Expected URL after deploy: `https://lock-in.lock-in-cb4.workers.dev`.

## Accounts and secrets (already set up by the user)
- Cloudflare: a **separate account named `lock-in`** (same login also has other people's accounts; do not touch them).
  workers.dev subdomain: `lock-in-cb4`.
- API token: account policy scoped to the `lock-in` account only (Workers template + D1 Read/Edit), user policy
  (User Details Read, Memberships Read), no zone policy, expires 2027-11.
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPENAI_API_KEY`.
  Old Supabase secrets may still exist; unused. GitHub Pages may be enabled; unused (the Worker serves the site).

## Architecture
- `src/`: Vite + React + TS app. `lib/api.ts` (fetch + bearer token in localStorage), `lib/store.tsx` (all data,
  loaded via `GET /api/data?parts=...`), `ui/` screens: Home (dashboard), Train (logger + rest timer),
  Coach (chat + inline check-in card), PlanView (view/edit plan, undo), Settings (push, times, goal, memories).
  `lib/defaultPlan.ts` is the starting plan (client PUTs it if the server has none).
- `public/sw.js`: app-shell cache + `push` / `notificationclick` (opens `?tab=coach`).
- `worker/src/`: one Cloudflare Worker. `index.ts` router (`/api/*`, everything else → static assets),
  `auth.ts` (PBKDF2 20k, first sign-up is the only account, then sign-up closes; sessions as SHA-256 of token),
  `coach.ts` + `prompt.ts` (OpenAI chat completions with tools: save/forget memory, update_plan, log_checkin,
  log_metric; model `gpt-6-luna`, falls back to `gpt-5.6-luna`, drops `reasoning_effort` if rejected),
  `notify.ts` (cron tick: ask / review / ask_late, deduped by `notify_log`), `webpush.ts` (RFC 8291/8292 with WebCrypto).
- `worker/migrations/0001_init.sql`: D1 schema.
- `wrangler.jsonc`: assets from `dist`, D1 binding `DB` (`__D1_ID__` is replaced in CI), cron `*/10 * * * *`.
- Deploy workflow: npm ci → type-check worker → build → find/create D1 `lock-in` → migrations apply --remote →
  `wrangler deploy` → VAPID keys generated once via `wrangler secret bulk` → `OPENAI_API_KEY` secret.

## Verified locally (wrangler dev, local D1)
- Sign-up, second sign-up blocked, wrong password, data load, check-in, sets (auto-marks day done), metrics, profile.
- Coach tool loop against a mock OpenAI server (memory + metric saved, reply stored).
- Push: payload decrypts with `http_ece`, VAPID JWT verifies; test push and cron "ask" delivered to a mock endpoint;
  two cron ticks sent the question once.

## Not verified yet (watch these on the first real run)
- Wrangler CI details: `d1 list --json` field `uuid`, non-interactive `d1 migrations apply --remote`,
  `secret list` output, `secret bulk` file format.
- Real OpenAI call: model id `gpt-6-luna` and `reasoning_effort` support.
- Workers Free CPU limit (10 ms) vs PBKDF2 20k on login/sign-up; lower iterations if it fails.
- Web Push on a real iPhone (iOS 16.4+, opened from the home-screen icon).

## After it deploys (user steps)
1. Open the URL in Safari → Share → Add to Home Screen → open from the icon.
2. Create the account (first sign-up becomes the only one).
3. Settings → enable notifications → send a test notification.
4. Coach → "תכיר אותי" so it saves facts about him.

## Notes for working with the user
- Writes in Hebrew; prefers concise, step-by-step instructions that match what's on screen.
- The repo is public: never commit personal details (health, body stats, sleep). The coach learns them in chat.
- Local: `npm run build && npx wrangler d1 migrations apply lock-in --local && npx wrangler dev`;
  UI-only preview: `npm run dev` → `/demo.html`.
