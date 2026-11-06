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
