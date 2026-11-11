# ClockAm mobile app (Expo)

Staff sign in once, then clock in and out with the phone's own fingerprint or face unlock. If the workplace has the
location check turned on, the app asks for the phone's location at clock-in.

This folder is **not** part of the root npm workspaces, so it cannot affect the Vercel or Render builds.

## Run it on your phone

```bash
cd apps/mobile
npm install
npx expo install --fix      # picks package versions that match your Expo SDK
npx expo start
```

Install **Expo Go** on the phone, scan the QR code, and sign in with a real workplace ID, email and password.
Point it at another API with `EXPO_PUBLIC_API_URL=http://<your-pc-ip>:4000/api npx expo start`.

## Build an installable Android app (.apk)

The config is ready (`eas.json`, Android permissions and package name in `app.json`). You need a free Expo account.

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas init                                   # links the project to your Expo account (writes the project ID into app.json)
eas build --platform android --profile preview
```

EAS builds in the cloud and gives you a link to an `.apk` you can send to staff. They may need to allow "install from unknown sources". To publish on Google Play instead, use `--profile production` (makes an `.aab`) and follow `PLAY_STORE.md`. iOS needs a paid Apple developer account.

## How it checks identity (and its limit)

The phone's fingerprint or face prompt runs on the phone. After it succeeds, the app calls `POST /api/attendance/clock`
with the signed-in session. The server records the method as `device-biometric`. It cannot verify that the prompt really
happened, which is weaker than the browser or kiosk fingerprint check (that one is signed by the phone's secure chip and
checked by the server). For workplaces that care most about buddy clocking, use the kiosk for clock-in and the app for
viewing history.

Forgot password opens the website's reset page in the phone browser.

Students do not use this app. They mark attendance in the phone browser (or the home-screen version of the site), which supports the passkey check that the app cannot.

## Not built yet

Push reminders, offline clock-in, and WebAuthn passkeys inside the app. I have not run this on a phone,
because the build sandbox cannot install Expo. Treat the first run as a test.
