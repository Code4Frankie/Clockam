# Publishing ClockAm on Google Play

You need: a Google Play developer account (one-time US$25 fee), the `.aab` from `eas build --platform android --profile production`, and the items below.

## Before you submit
- **Privacy policy URL:** https://clockam.vercel.app/privacy (live once the web app is deployed). Google requires it for apps that use location.
- **Terms:** https://clockam.vercel.app/terms
- **App name:** ClockAm. **Developer:** Frankiecode Solutions. **Support email:** use a real address you read.
- **Screenshots:** at least 2 phone screenshots (sign-in and the clock-in screen). Take them from Expo Go or the installed `.apk`.
- **Icon:** 512 x 512 PNG (resize `assets/icon.png`). **Feature graphic:** 1024 x 500 PNG.
- **Content rating:** fill the questionnaire (no violence, no user-generated content).
- **Target audience:** adults (workplaces).

## Data safety form (answer these honestly, change if the app changes)
- Collected: name, email, user ID (account); approximate and precise location (only when the workplace turns on the location check); app activity (clock-in and clock-out times).
- Not collected: fingerprint or face data (the phone checks it and the app never receives it), photos, contacts.
- Data is encrypted in transit (HTTPS). Users can ask their workplace admin to delete their account.
- Data is not sold. It is shared only with the user's own workplace.

## Review notes for Google
Give the reviewers a test workplace ID, email and password (create a throw-away workplace for this) because the app needs a sign-in to show anything.

## Things that commonly delay approval
- A privacy policy page that does not load, or that does not mention location.
- Asking for location without explaining why on screen (the permission text in `app.json` covers the system prompt).
- No test login for the reviewer.
