# Supabase config for password reset

The code side is done (`/forgot-password` + `/reset-password`), but the
emails won't fire unless the Supabase project itself is configured to
allow the redirect URL. Two one-time settings to verify.

## 1. Site URL + Redirect Allow-list

Supabase rejects any `redirectTo` that isn't on its allow-list. Set them
in the Supabase Dashboard:

**Project Settings → Authentication → URL Configuration**

- **Site URL:**

      https://www.lengamaps.com

- **Redirect URLs (one per line):**

      https://www.lengamaps.com/auth/callback
      https://www.lengamaps.com/reset-password
      https://www.lengamaps.com/dashboard
      http://localhost:3000/auth/callback
      http://localhost:3000/reset-password
      http://localhost:3000/dashboard

The `localhost` entries let you test password reset against a dev server.
Drop them if you don't want that.

## 2. Email template (optional — defaults are fine)

**Project Settings → Authentication → Email Templates → Reset Password**

The default body is:

    <h2>Reset Password</h2>
    <p>Follow this link to reset the password for your user:</p>
    <p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>

That works as-is. If you want it branded, only one thing matters:
**keep `{{ .ConfirmationURL }}`** — that's the placeholder Supabase
substitutes with the magic-link URL we redirect to.

Example branded version:

    <h2>Reset your Lenga Maps password</h2>
    <p>Hi there,</p>
    <p>We received a request to reset the password on your account.
    Click the button below to choose a new one. The link expires in
    1 hour.</p>
    <p><a href="{{ .ConfirmationURL }}"
       style="display:inline-block;background:#0A2540;color:#fff;
              padding:12px 24px;border-radius:8px;text-decoration:none;
              font-weight:bold">Reset password</a></p>
    <p style="color:#888;font-size:12px">
      If you didn't request this, you can safely ignore this email.
    </p>

## 3. (Optional) Tighten email rate limits

**Project Settings → Authentication → Rate Limits**

Default password-reset rate limit is 30/hour per email. Fine for our
volume. Crank it down to 5/hour if you want to slow brute-force
enumeration attempts at the email layer (we already gate at the app
layer by showing the same success message regardless of whether the
account exists).

## How to test

1. Sign up an account (or use an existing one).
2. Go to `/login` → click **Forgot password?**
3. Enter the email → click **Send reset link**.
4. Check the inbox (and spam). Click the link in the email.
5. Land on `/reset-password`. Enter a new password twice → submit.
6. You'll be redirected to `/dashboard`, signed in with the new password.

## How it works under the hood

```
┌────────────────┐  email + redirectTo  ┌──────────────────────┐
│ /forgot-pwd    │ ───────────────────► │ supabase.auth        │
│ (your page)    │                      │ .resetPasswordForEmail│
└────────────────┘                      └──────────┬───────────┘
                                                   │ sends email
                                                   ▼
                              ┌────────────────────────────────┐
                              │ Email arrives with link:        │
                              │ https://<proj>.supabase.co/    │
                              │   auth/v1/verify?token=…&      │
                              │   redirect_to=https://lengamaps │
                              │   .com/reset-password           │
                              └──────────────┬─────────────────┘
                                             │ user clicks
                                             ▼
                              ┌────────────────────────────────┐
                              │ Supabase verifies the token,    │
                              │ then 302s the browser to        │
                              │ https://lengamaps.com/reset-    │
                              │ password?code=<PKCE-code>       │
                              └──────────────┬─────────────────┘
                                             │
                                             ▼
                              ┌────────────────────────────────┐
                              │ /reset-password (your page):    │
                              │   exchangeCodeForSession(code) │
                              │   → user is now signed-in       │
                              │   show new-password form        │
                              │   submit → updateUser({pwd})    │
                              │   → redirect to /dashboard      │
                              └────────────────────────────────┘
```

The "your page" components are at:

- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`

Both pages handle the "user is already signed in" edge case by either
bouncing to the dashboard or letting them change password directly.
