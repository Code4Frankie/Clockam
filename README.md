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
| **USB scanner** (SecuGen Hamster, DigitalPersona via a helper) | Reader plus the small `apps/bridge` program on the front-desk PC | The bridge matches the finger against templates stored on that PC and reports a scanner user ID. The kiosk sends that ID to the API with the device key. Fingerprints never reach the server. |
| **ZKTeco standalone unit** (LX15) | The unit itself, pushing to `/iclock/*` | The unit matches the finger and pushes its punches. Off by default (`ZKTECO_PUSH_ENABLED`). The unit is identified only by its serial number, so anyone who knows it could send fake punches. Not confirmed on a real LX15. |
| **Mobile app** | Phone | The phone's biometric prompt unlocks the app; the app calls `POST /api/attendance/clock` with the employee's login token and GPS. |

Browsers cannot talk to a USB fingerprint reader directly, so the kiosk calls `POST {bridgeUrl}/identify` on the bridge and
gets `{ "scannerUserId": "12" }` back. See `apps/bridge/README.md` for what is built and tested (SecuGen driver, helper-program
driver, simulator) and what is not (DigitalPersona helper, real-hardware testing).

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

- Real-hardware testing of the SecuGen driver and the ZKTeco receiver; the DigitalPersona helper program; Futronic driver.
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

## Small features added later

- **Missed clock-outs** (owner/admin): sidebar page listing days with a clock-in and no clock-out, with a suggested closing-time clock-out you can edit and save.
- **Password reset**: admins can always set a temporary password from the Employees page. Emailed reset links work once `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` and `WEB_APP_URL` are set in Render. Until then the forgot-password page tells people to ask their admin. Changing a password signs out every other session. Only the owner can change admins; nobody can change the owner from the Employees page.
- **Offline clock-in (USB scanner tab only)**: if the internet is down, the kiosk saves scans on that PC with their real time and uploads them in order when it is back (up to 200, nothing older than 48 hours is accepted). Phone and PC fingerprint clock-in cannot work offline, because the server must issue a fresh challenge for every fingerprint.
- **Privacy and terms pages** at `/privacy` and `/terms`. They are written in plain language from what the software really does, but they are **not legal advice**. Have a Nigerian lawyer review them before you charge customers.

## Edit attendance, automatic clock-out and breaks

- **Edit attendance** (owner/admin): pick a person and a day, set the clock-in and clock-out as local times, and give a reason. Late or on time is worked out from the work hours; you cannot type a status in. Every change is kept on the day with who made it, why, and the old and new times. Future days are refused. Admins can edit their own days too, and it shows in the history.
- **Automatic clock-out** (Work hours & location page): choose how many hours after closing time a day left open is closed. The clock-out is recorded at the closing time, marked `auto`, and can be corrected on Edit attendance. The sweep runs every 10 minutes while the API is awake and whenever someone opens attendance or reports (at most every 5 minutes per workplace), because a sleeping Render plan cannot run a timer reliably.
- **Breaks**: staff start and end a break from the kiosk (both tabs) or the mobile app. Breaks are unpaid and subtracted from hours worked, up to 10 per day. A break left open is ended when the day closes. Breaks need the internet (they are not saved offline). Reports and the CSV show break minutes. Phone and PC fingerprint breaks use the same biometric check as clocking in.
- Reports CSV: names that start with `=`, `+`, `-` or `@` are prefixed so spreadsheets do not run them as formulas.

## Making phone clock-in harder to fake

Scanners and ZKTeco units only work at the workplace, so they are the strongest check. For staff on their own phones or laptops:

- **Location check** (Work hours & location): refuses a clock-in or break too far from the workplace. It trusts the location the phone reports, and fake-GPS apps exist, so it stops casual cheating only. Use an allowed distance of about 100 to 200 m.
- **Allowed networks** (same page): optional list of the workplace's public IP addresses or IPv4 ranges (nothing wider than /16). Personal devices on any other network are refused, including staff on mobile data. Use "Add the network I am on now" while on the workplace Wi-Fi, and check the address matches your real public IP, because the API sits behind a hosting proxy and `trust proxy` is set to one hop. If the address shown is the same for everyone or looks like a hosting address, do not turn this rule on. If your provider changes the address, update the list.
- **To review** page (managers and up): clock-ins that were accepted but landed in the outer 20% of the allowed distance. The flag is stored on the record when the person clocks in.
- Both rules apply to clocking in and to breaks from phones and laptops. They never apply to USB scanners, ZKTeco units or manual edits by an admin.

## School mode (class attendance with face or fingerprint)

Set **This is a School** when registering, or change it in **Settings**. A school gets two extra pages: **Classes** and **Students**.

How it works
1. **Students** (admin): upload a CSV (Name, Matric number, optional Department). Each student gets a one-time set-up code, shown once. Download the codes CSV and hand them out.
2. **Phone set-up** (student, once): open `/enrol?org=<school-slug>`, type the matric number and set-up code, and approve the phone's face or fingerprint prompt. Up to 2 phones per student. A code works once, expires in 14 days and locks after 5 wrong tries.
3. **Class** (lecturer): **Classes → Start class** opens a projector screen with a QR code and 6-digit code that change every 30 seconds.
4. **Attendance** (student): scan the QR (or open `/attend/<id>` and type the code), enter the matric number, confirm with the phone's face or fingerprint check. One mark per student per class.
5. Lecturers see the headcount on screen, the present list, and can download a CSV.

Face check: ClockAm uses the phone's own unlock (WebAuthn passkeys). ClockAm never receives or stores a face image. A website cannot force "face" specifically: a phone with face unlock uses it, a phone with only a fingerprint sensor uses that. The same passkeys also give staff a face/fingerprint clock-in on their own phones.

Limits to know
- Codes are valid for 30 to 60 seconds. Someone can forward a photo of the QR inside that window, but the friend also needs their own enrolled phone and passing the school's location/network rule.
- Turn on **location check** and/or **allowed networks** in Settings (campus coordinates, campus Wi-Fi) to keep marking inside campus.
- Two students sharing one phone cannot be told apart by the phone check alone.
- The school list is by upload only; there are no per-course rosters yet, so a class shows who was present, not who was absent.
- Web only: students use their phone browser, not the Expo app.
- Run `npm install` after pulling (new `qrcode` dependency) and commit `package-lock.json`.

### Courses, selfie and installing (added after school mode)

- **Account types:** Business, School, or Government office (Ministry, Department or Agency, "MDA"). Business and Government work the same way (staff clock in and out); School adds Classes, Courses and Students. A Business is stored as `workplace` so older accounts keep working.
- **Campus rule warning:** a school with no location check and no allowed Wi-Fi gets a warning in Settings and on Classes, and a confirmation before a class starts.
- **Selfie:** on by default for schools (Settings can turn it off). The student takes a small photo when marking attendance. Lecturers can view it from the class screen; it is deleted after 30 days while the attendance record stays. No face recognition is run on it, so it deters someone else marking for a friend but does not prove identity by itself.
- **Courses:** add a course, paste or upload its matric numbers (they must already be on the Students page), start classes for it, and see who is absent. The course report shows attended, held and percent per student, with CSV download. A student who marks a class but is not on the list is flagged "not on course list". All lecturers in a school can see all courses.
- **Install on phone:** the site has a web app manifest and icons, so Chrome offers "Install app" and iPhones use Share, Add to Home Screen. This is the website on the home screen, not a store app.

## Billing (Paystack)

Prices are not in the code. A platform admin (a user ID in `PLATFORM_ADMIN_USER_IDS`) opens **Plans and prices** in the app and sets: a one-time setup fee, VAT %, free-trial days, and plans by number of people (ranges must run on from each other, the last can have no limit). Amounts are entered in naira and stored in kobo.

- **Nothing is charged or locked** until at least one plan exists. Even then, admin pages are only locked when `BILLING_ENFORCED=true` on Render. Set that after you have tested payment.
- **Counting people:** active accounts other than the owner (for a school this includes students).
- **Paying:** the owner opens **Billing**, sees the amount (plan + setup fee once + VAT) worked out on the server, and pays through Paystack. Each payment adds 30 days. After a period ends there is a 3-day grace, then admin pages (employees, reports, scanners, attendance edits, classes, courses, student import) return "subscription expired". Clock-in, scanners and student attendance are never locked.
- **Setup on Render (server only, never on Vercel):** `PAYSTACK_SECRET_KEY` (use the **test** key first). In the Paystack dashboard set the webhook URL to `https://clockam.onrender.com/api/billing/webhook/paystack`. The webhook is checked by signature and the amount is verified before a payment counts.
- **OPay is not connected yet.** The button is Paystack only. OPay needs its sandbox keys and API documents before it can be added.

### Per-lecturer courses and the assistant lock

- In a school, the owner and admins see every course and class. A lecturer (manager role) sees, starts and reports only on courses and classes they created.
- The AI assistant is now covered by the billing lock like the other admin features.
- The mobile app has Android build config (`apps/mobile/eas.json`) and a Google Play checklist (`apps/mobile/PLAY_STORE.md`).
