# PM Ready server (backend)

Node.js + Express + MongoDB. It serves the whole website **and** a JSON API under `/api`, so pages and API share one origin and the sign-in cookie just works.

- One account for both sides: the **course** (progress is saved to the account) and the **Project Tool** (projects are saved to the database and shared).
- Register as **Personal** or **Company** (a company workspace is created with you as owner).
- One user → many projects and many companies. One project → many people.
- **Company staff** (`/account/company.html`): owners/admins add staff by email (Staff member or Admin), resend invitations, change roles, remove; see the company's projects.
- A project manager adds people to a project **by email** with an access role.
- **Email notifications**: people with an account get "you were added" emails; people without one get an **invitation email** with a sign-up link, and their access starts when they register from it. New accounts confirm their email; forgotten passwords are reset by email.
- **Admin dashboard** (`/admin/`) for our company: users (click one for everything about them: account, confirmed email, companies, projects, course progress per module, signed-in devices, emails, activity), companies, projects, email log, activity log; make/remove admins, disable accounts.

Without the server (GitHub Pages, opening the files directly) the site keeps working exactly as before: everything is saved in the browser.

**Setting up Google sign-in, Gmail sending and online hosting: follow [SETUP.md](SETUP.md).**

## Run it

Requirements: Node.js 22.9+ and MongoDB.

### 1. Start MongoDB (`mongodb://localhost:27017/`)

Pick one:

```bash
docker run -d --name pm-ready-mongo -p 27017:27017 -v pm-ready-mongo:/data/db mongo:8
```

```bash
brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community
```

MongoDB Compass can then connect to `mongodb://localhost:27017/` to look at the `pm_ready` database.

### 1b. Email inbox for development (Mailpit)

```bash
docker run -d --name pm-ready-mail --restart unless-stopped -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
```

Every email the app sends lands in **http://localhost:8025** instead of real inboxes. Gmail is prepared in `.env`: create an App Password (Google account → Security → 2-Step Verification → App passwords), switch the commented Gmail lines on, restart, then check with `npm run email:test -- you@gmail.com`. For other providers, put your email provider's SMTP settings in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`), e.g. Gmail with an app password, Resend, Amazon SES or Brevo, and set `APP_URL` to the site's public address so links work.

### 2. Start the server

```bash
cd backend
cp .env.example .env        # then set ADMIN_EMAILS to your email
npm install
npm start
```

Open **http://localhost:4000**. Register with the email you put in `ADMIN_EMAILS` to get the admin dashboard (or run `npm run make-admin -- you@company.com` for an existing account).

`npm run dev` restarts on code changes. `npm test` runs the API tests against an in-memory database (MongoDB not needed); `npm run test:mongo` runs them against MongoDB in a throwaway `pm_ready_test` database. `DB_DRIVER=memory npm start` runs the whole site without MongoDB (data is lost on restart).

## Roles

| Level | Roles | Notes |
|---|---|---|
| Platform (our company) | **main admin** (`SUPER_ADMIN_EMAIL`), `admin`, `user` | The main admin is always an admin, can't be changed or disabled, and is the only one who can add or remove admins. |
| | | Admins open `/admin/`: counts, every user's details, companies, project names (not project contents), email and activity logs; make admins, disable accounts. `ADMIN_EMAILS` accounts become admins once their email is confirmed |
| Company | `owner`, `admin`, `member` | Owners/admins add people by email and see/manage **every** project of the company |
| Project | `owner`, `manager`, `member`, `viewer` | Owner: everything incl. delete. Manager: edit + manage access. Member: edit. Viewer: read and download only |

A user's project role is the higher of their own role and "manager" if they are an owner/admin of the project's company. All checks are in [src/permissions.js](src/permissions.js); the browser only hides buttons.

## API

All under `/api`, JSON in and out. Writes must be JSON and come from the same origin.

| Method | Path | What |
|---|---|---|
| GET | `/health` | Server and database are up |
| POST | `/auth/register` | `{ name, email, password, accountType: personal\|company, companyName? }` |
| POST | `/auth/login` · `/auth/logout` | Sign in (rate-limited) / out |
| GET · PATCH | `/auth/me` | Current user + companies (`user: null` when signed out) / change name |
| POST | `/auth/password` | `{ current, next }`; signs out other devices |
| GET | `/auth/invite/:token` | What an invitation link is for (sign-up page) |
| POST | `/auth/verify` · `/auth/verify/resend` | Confirm email from the link / send the link again |
| POST | `/auth/forgot` · `/auth/reset` | Email a reset link / set a new password from it |
| GET | `/auth/providers` | Which sign-in options are on (`google: true` when configured) |
| GET | `/auth/google/start` · `/auth/google/callback` | Sign in with Google (OAuth 2.0 code flow with PKCE); creates or links the account by verified email |
| PUT · DELETE | `/auth/me/avatar` | Profile picture `{ image: data URL }` (JPEG/PNG/WebP, ≤ 300 KB; the browser crops it to 256 px) |
| GET | `/users/:id/avatar` | The picture (signed-in people only) |
| GET · POST | `/companies` | My companies / create one |
| GET · PATCH | `/companies/:id` | Company + members / rename (admin) |
| POST · PATCH · DELETE | `/companies/:id/members[/:mid]` | Add staff by email (emails them), change role, remove or leave |
| POST | `/companies/:id/members/:mid/resend` | Send the invitation again |
| GET · POST | `/projects` | Projects I can open (summaries) / create `{ doc, companyId? }` |
| GET · PUT · DELETE | `/projects/:id` | Open / save `{ doc, version }` (409 if someone saved first) / delete (soft) |
| GET | `/projects/:id/version` | Cheap check for other people's saves |
| GET · POST · PATCH · DELETE | `/projects/:id/access[/:aid]` | Who can open it; add by email (emails them), change role, remove/leave |
| POST | `/projects/:id/access/:aid/resend` | Send the invitation again |
| POST | `/projects/:id/transfer` | Owner hands the project over |
| GET · PUT | `/me/course` | Course progress |
| GET | `/admin/stats` · `/admin/users` · `/admin/users/:id` · `/admin/companies` · `/admin/projects` · `/admin/emails` · `/admin/audit` | Admin dashboard |
| PATCH | `/admin/users/:id` | `{ disabled }` or `{ platformRole }` |

## Data (MongoDB collections)

| Collection | Fields |
|---|---|
| `users` | `_id, email (unique), name, passwordHash, accountType, platformRole, disabled, emailVerified, createdAt, lastLoginAt, lastActiveAt` |
| `sessions` | `_id` (SHA-256 of the cookie token), `userId, createdAt, expiresAt` (ignored once expired), `userAgent` |
| `companies` | `_id, name, createdBy, createdAt` |
| `companyMembers` | `_id, companyId, userId \| null, email, role, status: active\|pending, addedBy, createdAt` |
| `projects` | `_id, companyId \| null, ownerId, name, doc` (the Project Tool's whole project), `version, createdAt, updatedAt, updatedBy, deletedAt` |
| `projectMembers` | `_id, projectId, userId \| null, email, role, memberId` (link to the team member in `doc.members`), `status, addedBy, createdAt` |
| `course` | `_id` (= userId), `data { read, tried, check }, modulesDone, updatedAt` |
| `audit` | `_id, at, actorId, action, target, meta` |
| `emails` | `_id, at, to, kind, subject, status: sent\|logged\|failed, error, actorId` (no message bodies or links) |
| `avatars` | `_id` (= userId), `mime, data` (base64), `updatedAt`; `users.avatarAt` marks who has one |
| `tokens` | `_id` (SHA-256 of the link token), `kind: verify\|reset\|invite, email, userId, meta, createdAt, expiresAt, usedAt` |

`status: pending` with `userId: null` means "invited by email, not joined yet". It becomes active when that person proves the address is theirs: registering from the invitation link, confirming their email, or resetting their password. So registering with someone else's address never opens their invitations.

## Switching to PostgreSQL later

Routes never touch the database driver. Everything goes through the repository in [src/db/repo.js](src/db/repo.js), whose functions (`users.create`, `projects.saveDoc`, `claimPending`, `stats`, …) are the contract. To move to Postgres:

1. Create tables with the same fields as above (ids are strings, dates are ISO timestamps; `doc` becomes `jsonb`).
2. Write `src/db/postgres-repo.js` exporting the same functions (e.g. with `pg`).
3. Add `postgres` to [src/db/index.js](src/db/index.js) and set `DB_DRIVER=postgres`.
4. Run `npm test`: the API tests must pass unchanged. Copy data across with a one-off script.

## Security

- Passwords: scrypt with a per-user salt (Node's built-in crypto). Never stored or logged in plain text.
- Sessions: random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie; only its hash is stored. Set `COOKIE_SECURE=true` behind HTTPS.
- Writes require JSON and a same-origin `Origin` header (blocks cross-site form posts).
- Sign-in and registration are rate-limited; "wrong email" and "wrong password" look and take the same.
- Projects you can't open return 404 (ids can't be probed). Project saves are version-checked, so nobody overwrites someone else's work by accident.
- `/backend/` is never served as a web page, and dotfiles (`.env`) are refused.

- Invitation, confirmation and reset links are single-use random tokens (only their hash is stored) that expire: invitations 14 days, confirmation 24 hours, reset 1 hour. Reset signs out every device.

- Google sign-in: state + PKCE, the state is also bound to the browser by a short-lived cookie, and only emails Google marks as verified are accepted.

Not built yet: two-step login (2FA), Microsoft sign-in. See [../Project_Mangment_Tool/docs/auth-and-backend-plan.md](../Project_Mangment_Tool/docs/auth-and-backend-plan.md).

## Files

```
src/server.js        Express app: API + static website
src/config.js        Settings from environment variables
src/auth.js          Password hashing, sessions, current-user middleware
src/security.js      Same-origin check, rate limits, input helpers
src/permissions.js   Roles and access checks
src/invites.js       Adding people by email, invitation/confirm/reset links
src/mailer.js        Email templates and SMTP sending (logged without bodies)
src/routes/*.js      auth, companies, projects, course, admin
src/db/repo.js       Every database query (the contract for Postgres later)
src/db/mongo.js      MongoDB driver + indexes
src/db/memory.js     In-memory driver for tests and demos
scripts/make-admin.js
test/api.test.js     End-to-end API tests
```
