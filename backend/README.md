# PM Ready server (backend)

Node.js + Express + MongoDB. It serves the whole website **and** a JSON API under `/api`, so pages and API share one origin and the sign-in cookie just works.

- One account for both sides: the **course** (progress is saved to the account) and the **Project Tool** (projects are saved to the database and shared).
- Register as **Personal** or **Company** (a company workspace is created with you as owner).
- One user → many projects and many companies. One project → many people.
- A project manager adds people **by email** with an access role; people without an account get access as soon as they register with that email.
- **Admin dashboard** (`/admin/`) for our company: users, course learners, project users, companies, projects, sign-ups, activity log.

Without the server (GitHub Pages, opening the files directly) the site keeps working exactly as before: everything is saved in the browser.

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

### 2. Start the server

```bash
cd backend
cp .env.example .env        # then set ADMIN_EMAILS to your email
npm install
npm start
```

Open **http://localhost:4000**. Register with the email you put in `ADMIN_EMAILS` to get the admin dashboard (or run `npm run make-admin -- you@company.com` for an existing account).

`npm run dev` restarts on code changes. `npm test` runs the API tests against an in-memory database (MongoDB not needed). `DB_DRIVER=memory npm start` runs the whole site without MongoDB (data is lost on restart).

## Roles

| Level | Roles | Notes |
|---|---|---|
| Platform (our company) | `admin`, `user` | Admins open `/admin/`: counts, users, companies, project names (not project contents), activity log; can disable accounts |
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
| GET · POST | `/companies` | My companies / create one |
| GET · PATCH | `/companies/:id` | Company + members / rename (admin) |
| POST · PATCH · DELETE | `/companies/:id/members[/:mid]` | Add by email, change role, remove or leave |
| GET · POST | `/projects` | Projects I can open (summaries) / create `{ doc, companyId? }` |
| GET · PUT · DELETE | `/projects/:id` | Open / save `{ doc, version }` (409 if someone saved first) / delete (soft) |
| GET | `/projects/:id/version` | Cheap check for other people's saves |
| GET · POST · PATCH · DELETE | `/projects/:id/access[/:aid]` | Who can open it; add by email, change role, remove/leave |
| POST | `/projects/:id/transfer` | Owner hands the project over |
| GET · PUT | `/me/course` | Course progress |
| GET | `/admin/stats` · `/admin/users` · `/admin/companies` · `/admin/projects` · `/admin/audit` | Admin dashboard |
| PATCH | `/admin/users/:id` | `{ disabled }` or `{ platformRole }` |

## Data (MongoDB collections)

| Collection | Fields |
|---|---|
| `users` | `_id, email (unique), name, passwordHash, accountType, platformRole, disabled, createdAt, lastLoginAt, lastActiveAt` |
| `sessions` | `_id` (SHA-256 of the cookie token), `userId, createdAt, expiresAt` (auto-deleted when expired), `userAgent` |
| `companies` | `_id, name, createdBy, createdAt` |
| `companyMembers` | `_id, companyId, userId \| null, email, role, status: active\|pending, addedBy, createdAt` |
| `projects` | `_id, companyId \| null, ownerId, name, doc` (the Project Tool's whole project), `version, createdAt, updatedAt, updatedBy, deletedAt` |
| `projectMembers` | `_id, projectId, userId \| null, email, role, memberId` (link to the team member in `doc.members`), `status, addedBy, createdAt` |
| `course` | `_id` (= userId), `data { read, tried, check }, modulesDone, updatedAt` |
| `audit` | `_id, at, actorId, action, target, meta` |

`status: pending` with `userId: null` means "added by email before registering"; registration turns these into active memberships.

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

Not built yet: email sending (invitations, password reset by email), email verification, 2FA. See [../Project_Mangment_Tool/docs/auth-and-backend-plan.md](../Project_Mangment_Tool/docs/auth-and-backend-plan.md).

## Files

```
src/server.js        Express app: API + static website
src/config.js        Settings from environment variables
src/auth.js          Password hashing, sessions, current-user middleware
src/security.js      Same-origin check, rate limits, input helpers
src/permissions.js   Roles and access checks
src/routes/*.js      auth, companies, projects, course, admin
src/db/repo.js       Every database query (the contract for Postgres later)
src/db/mongo.js      MongoDB driver + indexes
src/db/memory.js     In-memory driver for tests and demos
scripts/make-admin.js
test/api.test.js     End-to-end API tests
```
