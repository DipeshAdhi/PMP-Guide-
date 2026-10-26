# PM Ready setup guide: Google sign-in, Gmail, hosting

Three things only you can do (they need your Google account and payment/hosting choices). Each part ends with a check, so you know it worked. Never paste secrets into chat, screenshots or Git; they only go in `backend/.env` (local) or your hosting platform's "Environment variables" page.

---

## Part 1 · Sign in with Google (about 10 minutes)

### 1. Create a Google Cloud project
1. Open **https://console.cloud.google.com/** and sign in with dipeshrajadhikari@gmail.com.
2. Top bar → project picker → **New project** → name it `PM Ready` → **Create**, then select it.

### 2. Set up the consent screen (what people see when they click "Continue with Google")
1. Menu → **APIs & Services → OAuth consent screen** (newer consoles call it **Google Auth Platform → Branding**). Click **Get started**.
2. **App name:** `PM Ready` · **User support email:** your Gmail.
3. **Audience:** **External**.
4. **Contact email:** your Gmail → agree → **Create**.
5. **Data access / Scopes:** add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (the three basic ones; no Google review needed for these).
6. **Audience → Test users:** add the Gmail addresses you'll test with (e.g. dipeshrajadhikari@gmail.com, adipesh0@gmail.com). While the app is in *Testing*, only these people can sign in.

### 3. Create the OAuth client
1. **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create credentials → OAuth client ID**.
2. **Application type:** *Web application* · **Name:** `PM Ready web`.
3. **Authorized JavaScript origins:** `http://localhost:4000`
4. **Authorized redirect URIs:** `http://localhost:4000/api/auth/google/callback`
   (exactly this; a missing `/api` or a different port gives Google's "redirect_uri_mismatch" error)
5. **Create**. Copy the **Client ID** and **Client secret** (you can also download the JSON).

### 4. Put them in `backend/.env`
```
GOOGLE_CLIENT_ID=1234567890-abc….apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
```
Restart the server (Ctrl+C, then `npm start`). The startup line now says `Google sign-in: on`.

**Check:** open http://localhost:4000/account/signin.html → **Continue with Google** → pick a test user → you land in PM Ready, signed in. New Google users get an account automatically (their email counts as confirmed, so waiting project invitations open, and their Google photo becomes their profile picture). An existing account with the same email is linked, not duplicated.

### 5. Let everyone sign in (when you're ready)
Consent screen → **Audience → Publish app** → *In production*. With only the basic scopes, Google doesn't require a review; anyone with a Google account can sign in.

---

## Part 2 · Real email through Gmail (about 5 minutes)

Until this is done, emails (confirm email, invitations, password reset) go to the local test inbox at http://localhost:8025.

1. Google account → **Security** → turn on **2-Step Verification** (required for app passwords).
2. Open **https://myaccount.google.com/apppasswords** → name it `PM Ready` → **Create** → copy the 16-character password.
3. In `backend/.env`: put `#` in front of the four Mailpit lines (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, `MAIL_FROM=…`), remove the `#` from the six Gmail lines, and paste the app password after `SMTP_PASS=` (spaces don't matter).
4. Restart the server.

**Check:** `npm run email:test -- dipeshrajadhikari@gmail.com` → "Sent a test email…" and it arrives in Gmail.

Gmail is fine to start with (about 500 emails a day). For a real launch, a sending service with your own domain (Resend, Brevo, Amazon SES, Postmark) is more reliable and less likely to land in spam; it's only different `SMTP_*` values.

---

## Part 3 · Hosting (so it runs online, not just on your Mac)

The whole app (website + API) is one Docker container ([../Dockerfile](../Dockerfile)), so any platform that runs Docker works the same way. Suggested setup:

| Piece | Service | Notes |
|---|---|---|
| Database | **MongoDB Atlas** (free M0 cluster) | Hosted MongoDB; same data model as local |
| App | **Render** (Web Service, Docker) | Builds from your GitHub repo on every push; free tier sleeps when idle, paid tier ($7/month) doesn't. Railway and Fly.io work the same way. |
| Email | Gmail (Part 2) → later Resend/Brevo with your domain | |
| Domain | optional, e.g. `pmready.app` | Needed for branded email and a nicer address |

### A. Database: MongoDB Atlas
1. **https://www.mongodb.com/cloud/atlas** → sign up → create a free **M0** cluster (pick a region near your users).
2. **Database Access** → add a database user (username + generated password).
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere; the platform's IPs change). The user/password still protects it.
4. **Connect → Drivers** → copy the connection string, e.g. `mongodb+srv://pmready:<password>@cluster0.xxxxx.mongodb.net/`.

### B. App: Render
1. Push the repo to GitHub (as you do now).
2. **https://render.com** → New → **Web Service** → connect the repo → Render detects the **Dockerfile**.
3. **Environment variables** (copy names from `backend/.env.example`):
   ```
   MONGODB_URI=mongodb+srv://…            (from Atlas)
   DB_NAME=pm_ready
   APP_URL=https://pm-ready.onrender.com  (your Render address or custom domain, no trailing slash)
   SUPER_ADMIN_EMAIL=dipeshrajadhikari@gmail.com
   GOOGLE_CLIENT_ID=…   GOOGLE_CLIENT_SECRET=…
   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
   SMTP_USER=dipeshrajadhikari@gmail.com  SMTP_PASS=…  MAIL_FROM=PM Ready <dipeshrajadhikari@gmail.com>
   ```
   (`HOST`, `PORT`, `TRUST_PROXY` and `COOKIE_SECURE=true` are already set by the Dockerfile. If the platform gives its own `PORT`, it overrides 4000 automatically.)
4. **Health check path:** `/api/health`.
5. Deploy. **Check:** `https://<your-app>/api/health` shows `{"ok":true,"db":"mongo"}`.

### C. Tell Google about the online address
Google Cloud → your OAuth client → add:
- Authorized JavaScript origin: `https://<your-app>`
- Authorized redirect URI: `https://<your-app>/api/auth/google/callback`

Keep the localhost entries for development.

### D. Your own domain (optional)
Render → Settings → Custom Domains → add `app.yourdomain.com` and create the DNS record it shows. Then update `APP_URL`, the Google URIs, and (with an email service) `MAIL_FROM`.

### E. Move your local data (optional)
```bash
docker exec pm-ready-mongo mongodump --db pm_ready --archive > pm_ready.archive
docker exec -i pm-ready-mongo mongorestore --uri "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/" --archive < pm_ready.archive
```
(Type the Atlas password in your own terminal.)

### GitHub Pages
The GitHub Pages site keeps working in "this browser only" mode. Once the hosted app is live, link people to its address for accounts, or point your domain at the hosted app instead.

---

## Quick reference

| Task | Command / place |
|---|---|
| Start locally | `cd backend && npm start` → http://localhost:4000 |
| Test inbox (local) | http://localhost:8025 |
| Check email settings | `npm run email:test -- you@gmail.com` |
| Run tests | `npm test` (memory) · `npm run test:mongo` (MongoDB) |
| Build the container | `docker build -t pm-ready .` (from the repo root) |
| Admin dashboard | `/admin/` signed in as SUPER_ADMIN_EMAIL |
