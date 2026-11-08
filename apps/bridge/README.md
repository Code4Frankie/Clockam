# ClockAm scanner bridge

Browsers cannot talk to a USB fingerprint reader. This small program runs on the front-desk Windows PC and answers the
kiosk page on `http://127.0.0.1:8123`.

## Status

| Piece | State |
| --- | --- |
| Local service, CORS lock to your kiosk site, admin-token enrolment | Built and tested |
| `simulator` driver (no hardware) | Built, for testing the kiosk and API end to end |
| `secugen` driver (Hamster Plus/Pro) | Built against SecuGen's published WebAPI and tested with a fake service. **Not yet run on a real reader** |
| `command` driver (any reader with a helper program) | Built and tested |
| DigitalPersona 4500 helper program | **Not built.** It needs the U.are.U SDK installed on a PC with the reader |
| ZKTeco LX15 | Does not use this bridge. It pushes punches to the API (see below) |

## SecuGen Hamster Plus / Pro

1. Install the reader driver (Windows Update usually does it) and the **SecuGen WebAPI client** from https://webapi.secugen.com.
2. Start the bridge:

```bash
BRIDGE_ADAPTER=secugen BRIDGE_ALLOWED_ORIGINS=https://clockam.vercel.app BRIDGE_ADMIN_TOKEN=pick-a-long-secret \
SECUGEN_ORIGIN=https://clockam.vercel.app SECUGEN_INSECURE_LOCALHOST=true npm run start -w apps/bridge
```

- `SECUGEN_ORIGIN`: the website the licence is for. SecuGen's service rejects calls with no origin (its error codes 10003/10004).
- `SECUGEN_LICENCE`: your licence string. Without one the service runs a limited 60-day trial.
- `SECUGEN_INSECURE_LOCALHOST=true`: accepts the service's own certificate on this PC only. Skip it if the certificate is already trusted.
- `SECUGEN_MIN_SCORE`: match score from 0 to 199, default 100. **This is a starting point.** A lower number lets the wrong person in. Test it on your own staff.
- Enrol: `POST /enroll` with `{"scannerUserId":"12"}` and the `x-bridge-admin` header. The person places the same finger twice. The bridge rejects poor scans and a finger already enrolled under another ID.
- Matching asks the SecuGen service to score the new scan against every stored template, so it suits a few hundred staff, not thousands.
- Templates are stored in `.clockam-bridge/templates.json` in the Windows user's folder. Turn on BitLocker.

## DigitalPersona 4500 (needs a helper program)

DigitalPersona readers have no local web service, only a native SDK. Build a small console program with that SDK and run the
bridge with `BRIDGE_ADAPTER=command BRIDGE_COMMAND=C:\path\dp-helper.exe`. It must answer:

- `dp-helper identify` prints `{"scannerUserId":"12"}` (or `null`)
- `dp-helper enroll <id>` prints `{"ok":true}`
- `dp-helper remove <id>` prints `{"removed":true}`

A non-zero exit code is a failure and the first line on stderr is shown to the user. IDs are letters, numbers, `-` and `_`.

## Try it without hardware

```bash
BRIDGE_ALLOWED_ORIGINS=http://localhost:5173 BRIDGE_ADMIN_TOKEN=change-me-please SIM_USER_ID=12 npm run start -w apps/bridge
```

Then open the kiosk, choose "USB / handheld scanner" and press Scan. The kiosk sends scanner ID `12` to the API.
Link an employee to that ID first on the **Scanners** page.

## Writing a real driver

Return an object with `name`, `isReady()`, `identify()`, `enroll(id)` and `remove(id)` from `src/adapters/`, and register it in
`src/adapters/index.js`. `identify()` waits for a finger, matches it against templates stored on this PC and returns the
matching ID, or `null`. Fingerprint templates stay on the PC and never go to the ClockAm server.

## Settings (environment variables)

- `BRIDGE_ALLOWED_ORIGINS` (required): kiosk site(s), comma separated, e.g. `https://clockam.vercel.app`
- `BRIDGE_ADMIN_TOKEN`: 8+ characters, needed to enrol or remove fingerprints
- `BRIDGE_ADAPTER`: `simulator` for now
- `BRIDGE_PORT`: default 8123. It listens on this PC only.

## ZKTeco LX15

The unit matches fingers itself. ClockAm receives its punches directly (no bridge):

1. In Render, set `ZKTECO_PUSH_ENABLED=true`.
2. On the **Scanners** page choose "ZKTeco unit", enter the unit's serial number, and register it.
3. On the unit, open its cloud server (ADMS) settings and enter the server address shown on screen.
4. Link each person using the PIN the unit shows as the "User ID on the scanner".

The first punch of the day is the clock-in and the last punch is the clock-out. Punches older than 14 days are ignored.

**Know before you enable it:** the unit identifies itself only by serial number, so anyone who learns the number could send fake
punches. Many units can only talk plain HTTP, but Render redirects HTTP to HTTPS, which a unit may not follow. I have not
confirmed either point on an LX15. Ask the seller whether the unit supports HTTPS cloud servers before you buy.
