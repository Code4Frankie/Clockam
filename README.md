# ClockAm

Biometric clock-in and attendance platform for workplaces. **Owned by Frankiecode Solutions.**

```
clockam/
├── apps/
│   ├── api/      Node.js (ES modules) + Express + MongoDB REST API
│   ├── web/      React (Vite) admin dashboard + kiosk screen
│   └── mobile/   (next) Expo app, see "Mobile app" below
```

## How fingerprints are captured

| Capture method | Where it runs | How ClockAm verifies it |
|---|---|---|
| **WebAuthn** (phone sensor, Windows Hello, FIDO2 USB fingerprint key) | Browser on kiosk PC, phone or laptop | The device verifies the finger and signs a challenge. The API stores only a public key, never a fingerprint. |
| **USB / handheld scanner** (ZKTeco, SecuGen, DigitalPersona, etc.) | Scanner plus a small local "bridge" service on the PC | The scanner matches the finger and reports its own user ID. The kiosk sends that ID to the API with the device key. |
| **Mobile app** | Phone | The phone's biometric prompt unlocks the app; the app calls `POST /api/attendance/clock` with the employee's login token and GPS. |

Browsers cannot talk to a USB fingerprint reader directly. For plain USB readers you need the vendor's local bridge/SDK.
The kiosk expects the bridge to answer `POST {bridgeUrl}/identify` with `{ "scannerUserId": "12" }` (and to allow CORS
from the kiosk origin). A thin bridge for your specific scanner model is the next piece to build.

## Run locally (Windows, VS Code terminal)

Requirements: Node.js 20+, MongoDB (local or Atlas).

```bash
npm install                       # run in the clockam folder, installs api + web
copy apps\api\.env.example apps\api\.env   # then edit JWT_SECRET and MONGODB_URI
npm run dev:api                   # API on http://localhost:4000  (check /health)
npm run dev:web                   # Web on http://localhost:5173
```

First run:
1. Open http://localhost:5173/register and create your workplace (this makes the owner account).
2. Employees page: add staff with a Staff ID and temporary password.
3. Each employee logs in, opens **My fingerprint** and enrols on their phone or Windows Hello laptop.
4. Open the kiosk at `http://localhost:5173/kiosk/<your-workplace-id>`; staff enter their Staff ID and touch the sensor.
5. For hardware scanners: **Scanners** page, register the device, link employees to their scanner user IDs, then enter the
   device ID and key in the kiosk's "Scanner settings".

WebAuthn needs HTTPS in production (localhost is exempt). `WEBAUTHN_RP_ID` must be your web domain and
`WEBAUTHN_ORIGIN` the exact web URL.

## API summary

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/register-org`, `/api/auth/login` | public |
| GET | `/api/auth/me` | any user |
| GET/POST/PATCH | `/api/employees` | manager+ / admin+ to change |
| DELETE | `/api/employees/:id/fingerprints` | admin+ |
| GET/POST/PATCH | `/api/devices`, `/api/devices/:id/link-employee` | admin+ |
| POST | `/api/biometric/webauthn/register/{options,verify}` | logged-in employee |
| POST | `/api/biometric/webauthn/login/{options,verify}` | kiosk (public, rate limited) |
| POST | `/api/biometric/scanner/clock` | registered device (`x-device-id`, `x-device-key`) |
| POST | `/api/attendance/clock` | mobile app, logged-in employee |
| GET | `/api/attendance`, `/api/attendance/today`, `/api/attendance/me` | manager+ / self |
| POST | `/api/attendance/manual` | admin+ |
| GET | `/api/reports/summary`, `/api/reports/export.csv` | manager+ |

Clocking toggles automatically: first scan of the day is clock-in (marked late after `workStart + graceMinutes`),
the next is clock-out. Optional geofence applies to phone/PC clock-ins.

## Deploy

- **Database:** MongoDB Atlas.
- **API:** Render/Railway, root `apps/api`, build `npm install`, start `npm start`. Set the variables from `.env.example`
  (`CORS_ORIGINS`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` must match the web URL).
- **Web:** Vercel/Netlify/Render static site, root `apps/web`, build `npm run build`, output `dist`.
  Set `VITE_API_URL=https://<your-api>/api` and add an SPA rewrite of all paths to `index.html` (kiosk routes need it).

## Mobile app (next step)

Expo + React Native in `apps/mobile`: login, `expo-local-authentication` fingerprint prompt, `expo-location` for the
geofence, then `POST /api/attendance/clock`; history from `/api/attendance/me`. Build the APK with EAS Build.

## Known gaps / roadmap

- Scanner bridge for specific hardware models.
- Refresh tokens, password reset, email/SMS notifications.
- Shifts per employee, leave management, offline queue in the mobile app.
- Automated tests (Vitest + Supertest).

## Vercel + Render quick reference

- `render.yaml` (repo root): Render Blueprint for the API. Fill the `sync: false` values in the dashboard.
- `apps/web/vercel.json`: SPA rewrite so kiosk and dashboard links work on refresh.
- Vercel: root directory `apps/web`, framework Vite, env `VITE_API_URL=https://<api>.onrender.com/api`.
- `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` must be the **Vercel** domain. Choose your final domain before staff enrol fingerprints.
- Render free tier sleeps when idle; use a paid instance or a keep-alive ping on `/health` for real use.

## Assistant and site auditor

### ClockAm assistant

A chat widget (bottom-right for signed-in users) backed by `POST /api/agent/chat`, which streams events over
Server-Sent Events. It needs `ANTHROPIC_API_KEY` on the API. Without it the endpoint answers 503 and everything else works as before.
`?stream=false` returns one JSON reply instead (useful for Postman and the future mobile app).

| Who | What the assistant can do |
|---|---|
| Any signed-in user | Check their own status today and their own attendance history (up to 62 days) |
| Manager and above | Find employees, today's overview, attendance for a range, report summary, late and absent list, missing clock-outs |
| Admin and above | **Propose** an attendance correction, disable or enable an employee, reset fingerprints. Each one waits for the user to press Confirm |
| Platform admin | Read the site audit report and queue SEO suggestions for approval |

Rules built into the code (most are covered by automated tests):
- It can never clock anyone in or out. Clock events need a real fingerprint or device proof.
- Every tool runs with the signed-in user's own role and workplace. The workplace always comes from the login, never from the model.
- Changes are never executed by the model. `POST /api/agent/confirm` runs them once, for the same user, before they expire
  (`AGENT_CONFIRM_TTL_SECONDS`), and re-checks permissions at that moment.
- Passwords, fingerprint data and device keys are never returned to the model. Stored names and notes are treated as data, not instructions.
- Model-supplied filters are validated: `$` operators and dotted keys are rejected.
- Every tool call is logged in `agentlogs` (validated input and status, not full results) and deleted after `AGENT_LOG_RETENTION_DAYS`.

**Privacy:** to answer questions, employee names, staff IDs, dates and clock times are sent to the Anthropic API. GPS coordinates,
notes and credentials are not. Review your obligations under Nigeria's data protection law (NDPA 2023) and tell staff.

### Site auditor

Checks the live public pages and deployment, and stores every run in `seoaudits` so regressions show up.

```bash
npm run seo:crawl -- --base https://your-app.vercel.app --api https://your-api.onrender.com
#   --dry-run  (do not save)   --no-render  (skip Playwright)   --fail-on-high  (exit 1 on any high issue)
```
Rendered checks use Playwright. Locally, run `npx playwright install chromium` once. It checks titles, descriptions,
canonical and Open Graph tags (raw HTML versus after JavaScript), that private pages send `noindex`, JSON-LD validity,
sitemap coverage, SPA deep links, API reachability, CORS, and that `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` match the site.

- **Schedule:** `.github/workflows/seo-audit.yml` runs it every Monday and from the Actions tab. Add repository secrets
  `SEO_BASE_URL`, `SEO_API_URL` and `MONGODB_URI`.
- **Report:** sign in as a platform admin and open **Site audit**, or call `GET /api/admin/seo/report`.
- **Platform admin:** set `PLATFORM_ADMIN_USER_IDS` on Render to your user id (`GET /api/auth/me`, field `user.id`). IDs are used instead of
  emails because anyone can sign up with any email.
- **Not indexed:** `apps/web/vercel.json` sends `X-Robots-Tag: noindex` for the dashboard, kiosk and admin pages. They are deliberately
  not blocked in `robots.txt`, because crawlers must fetch a page to see its noindex. `robots.txt` and `sitemap.xml` are generated at build
  time from `SITE_URL` (or Vercel's production URL).

### Where each setting goes

| Setting | Render (API) | Vercel (web) | GitHub (Actions) |
|---|---|---|---|
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | yes | **never** | no |
| `AGENT_MAX_STEPS`, `AGENT_TIMEOUT_MS`, `AGENT_RATE_LIMIT_PER_MIN`, `AGENT_CONFIRM_TTL_SECONDS`, `AGENT_LOG_RETENTION_DAYS` | yes | no | no |
| `PLATFORM_ADMIN_USER_IDS` | yes | no | no |
| `SITE_URL` (optional, for sitemap) | no | optional | no |
| `SEO_BASE_URL`, `SEO_API_URL`, `MONGODB_URI` | no | no | secrets |

Postman: import `docs/ClockAm.postman_collection.json`, set `apiUrl`, `orgSlug`, `email`, `password`, then run **Auth > Login**.

### Tests

```bash
npm run test:api
```
Covers tool permissions by role, invalid input, operator injection, secrets never leaving a tool, confirmation gating (expired, reused,
wrong user, wrong workplace, tampered), the agent loop and step limit, auditor issue detection and report grouping. They run without a database.

Not covered yet, and worth adding against a test database (FerretDB works): keeping one workplace's data away from another. This is enforced
by every query filtering on the signed-in user's workplace, but no automated test proves it. Also untested: HTTP routes and live model calls.

### Known limits
- Answers appear one step at a time, not word by word.
- A confirmation is used up when pressed. If the action then fails, ask the assistant again.
- The mobile app will need a non-streaming mode (`?stream=false`) or an SSE helper, because React Native does not stream `fetch` bodies.
