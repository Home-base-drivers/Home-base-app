# Installed iPhone app email sign-in

Email links can open Safari instead of the installed PWA. Verify an email OTP
inside Home Base to create the session in the app where the request started.
Never transfer session credentials through URLs, clipboard, or local backups.

## Production dependency before activating v270

In the existing Home Base Supabase project (`nixihmurdtfcbffgvpij`), inspect
Authentication → Emails → Magic link. Preserve the existing template and add:

```html
<p>Your Home Base sign-in code:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:bold">{{ .Token }}</p>
<p>Return to the installed Home Base app and enter this code. Do not share it.</p>
```

The browser link may remain as an explicitly labeled browser alternative.
Do not change SMTP credentials, redirect allowlists, token lifetime, or account
settings for this change. Do not activate the UI until the template includes
the code. Never record a real code or session value in tests, logs, or screenshots.

## Verification

Request a code from the installed app, enter the newest email code in that same
app, confirm the account is displayed, then close/reopen it and confirm session
restoration. Check Safari separately; it must not need to relay its session.
An invalid/expired code must stay signed out and show an error. Requesting an
email must never claim that the user is already signed in.
