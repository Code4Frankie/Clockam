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

## Build an installable app later

`npm install -g eas-cli`, then `eas build --platform android --profile preview` (needs a free Expo account).
Android gives you an `.apk` you can share. iOS needs a paid Apple developer account.

## How it checks identity (and its limit)

The phone's fingerprint or face prompt runs on the phone. After it succeeds, the app calls `POST /api/attendance/clock`
with the signed-in session. The server records the method as `device-biometric`. It cannot verify that the prompt really
happened, which is weaker than the browser or kiosk fingerprint check (that one is signed by the phone's secure chip and
checked by the server). For workplaces that care most about buddy clocking, use the kiosk for clock-in and the app for
viewing history.

## Not built yet

Password reset, push reminders, offline clock-in, and WebAuthn passkeys inside the app. I have not run this on a phone,
because the build sandbox cannot install Expo. Treat the first run as a test.
