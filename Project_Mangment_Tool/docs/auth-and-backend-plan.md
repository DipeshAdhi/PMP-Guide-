# Accounts, sign-in and backend: plan

Status: **plan only, nothing built yet.** This document decides how user accounts and the backend will work *before* any backend code is written, so the frontend can be prepared for it without rework.

Scope: the **Project Tool** only. The Learn side stays account-free (course progress stays in the browser) unless we decide otherwise later.

---

## 1. Where we are today

| Thing | Today | Matters for the backend because… |
|---|---|---|
| Hosting | Static files on GitHub Pages | There is no server of our own. Whatever we pick must work with a static frontend on a different domain. |
| Data | One JSON document per project in `localStorage` (`pmt_projects_v1`) | Easy to upload as-is; the whole document is the unit of saving. |
| Data access | Everything goes through `PMT.store` → `list() / get(id) / save(p) / remove(id)`, all Promise-based | A server adapter can replace it without touching any screen. |
| People | `members[]` = `{ id, name, role, email, invite: 'pending' }` | `role` is a **job title** ("Developer", "Teacher"), not a permission. A team member may never sign in. |
| Concurrency | `updatedAt` on every save; other tabs refresh via storage events | Basis for "someone else changed this" detection. |
| Safety | All user text goes through `esc()` before it reaches HTML | Important: sign-in tokens will live in the browser, so XSS must stay closed. |

---

## 2. Recommended architecture

```
 Browser (GitHub Pages, static)                Managed backend (Supabase)
 ┌───────────────────────────────┐            ┌───────────────────────────────────┐
 │ Project_Mangment_Tool/*.html  │  HTTPS     │ Auth      email+password, OAuth,  │
 │  PMT.auth  ── sign in/out ────┼──────────▶ │           reset, verification, MFA │
 │  PMT.store ── ApiAdapter ─────┼──────────▶ │ Postgres  projects, members,       │
 │  PMT.can   ── hide controls   │            │           invitations, audit log   │
 │                               │ ◀──────────┼ Realtime  push changes to others   │
 └───────────────────────────────┘            │ Row Level Security = the real      │
                                              │           permission check         │
                                              │ Edge Functions  send invite emails │
                                              └───────────────────────────────────┘
```

**Recommendation: Supabase** (hosted Postgres + Auth + Row Level Security + Realtime).

Why it fits this project:
- **No server to run.** The site stays on GitHub Pages; the browser talks to Supabase directly.
- **Auth is done for us:** verification emails, password reset, OAuth (Google/Microsoft), MFA, rate limiting, and password hashing are built in. We don't write or store password code ourselves.
- **Permissions live in the database** (Row Level Security). Even if someone edits the JavaScript, the database refuses what their role doesn't allow.
- **Postgres** is relational, so later we can split projects into tables (items, sprints, comments) for item-level permissions and reports.
- The JS client loads from a CDN as a classic script (`window.supabase`), so we keep the **no build step** rule.

### Alternatives considered

| Option | Good | Not so good | When to choose it |
|---|---|---|---|
| **Supabase** (recommended) | Auth + DB + permissions + realtime in one; SQL; open source, can self-host later | Learning RLS policies; free tier has limits (idle projects pause, email sending is rate-limited) | Small team, want to ship accounts quickly |
| **Custom API** (Node/Fastify or Express + Postgres) | Full control; secure `httpOnly` cookie sessions; any business rule | We build and maintain auth, hashing (argon2id), resets, rate limits, email, hosting, backups | Need rules Supabase can't express, or a company requires its own server |
| **Firebase** (Auth + Firestore) | Very easy auth; document model matches today's JSON | NoSQL makes reports and per-item permissions awkward; vendor lock-in | Mostly mobile apps, simple sharing |

The frontend plan below is the same for all three; only the adapter changes.

---

## 3. Two kinds of "people"

Keep these separate:

1. **Team member** (already exists): a person on the project plan who can be assigned work. Has a name, a job title, and optionally an email. Does **not** need an account.
2. **User account** (new): someone who can sign in.

They are linked when a team member accepts an invite: `members[].userId` gets the account id. Until then the member is "Invite pending" (the placeholder that already exists).

Each project membership also gets an **access role** (permission level), separate from the job title.

---

## 4. Sign-in flows

| Flow | Phase | Notes |
|---|---|---|
| Sign up with email + password | 1 | Email must be verified before projects can be shared. Minimum 10 characters; leaked-password check if the plan allows it. |
| Sign in / sign out | 1 | "Sign out of all devices" in Account. |
| Forgot password → email link → new password | 1 | Link expires; response doesn't reveal whether the email exists. |
| Sign in with Google / Microsoft | 1 or 2 | OAuth with PKCE. Schools/companies mostly use one of these. |
| Magic link (email-only sign-in) | optional | Good for stakeholders who rarely visit. |
| Change email / password | 2 | Re-verify the new email. |
| Delete account + download my data | 2 | Projects owned alone are deleted or transferred first. |
| Two-factor (authenticator app) | 4 | Required for Owners/Admins later. |
| Company SSO (SAML) | later | Only if organisations ask for it. |

Bot protection (Turnstile/hCaptcha) on sign-up and reset, checked on the server side by the auth service. Sign-in attempts are rate-limited by the service.

### Sessions

- Supabase keeps a short-lived access token (JWT) and a refresh token in browser storage and refreshes automatically.
- Because the token is readable by JavaScript, **XSS is the main risk**. Rules: keep using `esc()` for every user value, never use `innerHTML` with raw input, load scripts only from pinned CDN versions with integrity hashes, and add a Content-Security-Policy `<meta>` tag (GitHub Pages can't set headers).
- If we later need `httpOnly` cookies, that means a custom API on the **same site** (e.g. `app.example.com` + `api.example.com` on a custom domain); cross-site cookies from `github.io` will be blocked by browsers.

---

## 5. Access roles (RBAC, enforced later)

Five project-level roles. Phase 2 enforces them per project; finer rules ("members edit only their own items") come in phase 3, as agreed.

| Can… | Owner | Admin | Project manager | Member | Viewer / Stakeholder |
|---|:-:|:-:|:-:|:-:|:-:|
| See the project, board, Gantt, calendar | ✓ | ✓ | ✓ | ✓ | ✓ |
| Download PNG / PDF / CSV, export .ics | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment *(future)* | ✓ | ✓ | ✓ | ✓ | ✓ |
| Propose a change request | ✓ | ✓ | ✓ | ✓ | ✓ |
| Move own items, tick subtasks, log time | ✓ | ✓ | ✓ | ✓ | – |
| Create / edit / delete any item | ✓ | ✓ | ✓ | phase 3: own only | – |
| Plan: sprints, WBS, Gantt dates, milestones, dependencies | ✓ | ✓ | ✓ | – | – |
| Approve / reject change requests | ✓ | ✓ | ✓ | – | – |
| Manage risks and calendar events | ✓ | ✓ | ✓ | events only | – |
| Invite people, change their roles | ✓ | ✓ | invite as Member/Viewer | – | – |
| Change methodology, tools, settings | ✓ | ✓ | ✓ | – | – |
| Delete the project, transfer ownership | ✓ | – | – | – | – |

Rules:
- Every project has exactly one Owner (transfer before leaving).
- The UI hides what a role can't do (`PMT.can('plan')`), but **the database decides**. Hiding is only for convenience.
- Viewer is what we earlier called "information hidden per role": stakeholders see progress without edit controls.

---

## 6. Invitations

Uses the email already stored on team members.

```
PM clicks "Invite" on a team member (email required, role picked)
  → server creates invitation { project, email, role, token (hashed), expires in 7 days }
  → email sent: "Alex invited you to School system rollout"
Invitee opens link → signs in or signs up (with that email)
  → server checks: token valid, not expired, email matches the account
  → adds project_members row, sets members[].userId, invite: 'accepted'
  → project appears in their Projects list
```

- Pending invites can be resent or cancelled; the Team screen shows Pending / Active / Expired.
- Inviting an email that isn't a team member yet adds them to the team at the same time.
- Template example addresses (`@example.com`) are never emailed.
- Email needs a real sender (custom SMTP such as Resend, Postmark or Amazon SES) and our own domain; the built-in test mailer is only for development.

---

## 7. Data model

### Phase 1–2: keep the project as one document

Fastest path, matches `PMT.store` exactly.

```
profiles            id (= auth user id), display_name, avatar_url, created_at
projects            id, owner_id, name, key, doc jsonb  -- today's Project object
                    version int, updated_at, updated_by, deleted_at
project_members     project_id, user_id, access_role, member_id (→ doc.members[].id),
                    joined_at
invitations         id, project_id, email, access_role, member_id, token_hash,
                    invited_by, expires_at, accepted_at, revoked_at
audit_log           id, project_id, actor_id, action, summary, at
```

Limitation: with one document, the database can only say "may read" / "may write the whole project". That is enough for Owner/Admin/PM (write) vs Viewer (read). Member gets write access at project level until phase 3.

### Phase 3: split into tables

When item-level permissions, comments, search and reports are needed:

```
items (id, project_id, number, kind, parent_id, title, description, type, status,
       assignee_user_id / member_id, start_date, due_date, estimate, duration,
       moscow, iteration_id, rank, created_by, updated_at, version)
item_deps (item_id, depends_on_id)
milestones, milestone_items, iterations, changes, risks, events, event_attendees,
comments, attachments (storage bucket), notifications
```

Each table carries `project_id`, so one RLS helper (`project_role(project_id)`) protects everything. The browser still assembles a `Project` object, so screens don't change.

---

## 8. Frontend changes (no screen rewrites)

| Piece | What it does |
|---|---|
| `js/auth.js` → `PMT.auth` | `user()`, `onChange(fn)`, `signUp`, `signIn`, `signInWith('google')`, `signOut`, `resetPassword`. Local mode returns a fake "This browser" user. |
| `js/store-api.js` → `ApiAdapter` | Same four methods. `save(p)` sends `version`; server answers **409** if someone saved in between. |
| `PMT.can(action)` | Reads the current user's access role for the project; views use it to hide buttons. |
| New pages | `account/sign-in.html`, `sign-up.html`, `reset.html`, `invite.html?token=…`, `account.html` (profile, password, sign out everywhere, delete account). |
| Guards | `project.html` redirects to sign-in when there is no session (cloud mode). Top bar shows the user avatar + menu. |
| Team screen | "Invite" becomes real; shows access role, invite status, resend/cancel. |
| Conflict message | "Sam changed this project a moment ago — reload to see their changes" (phase 1–2, whole-project); per-item merging in phase 3. |
| Realtime | Subscribe to the open project; reload it when another user saves (like the storage-event refresh today). |

API mapping for the adapter:

| `PMT.store` | Supabase call | Custom API equivalent |
|---|---|---|
| `list()` | select projects joined with my `project_members` | `GET /projects` |
| `get(id)` | select `doc, version` where id | `GET /projects/:id` |
| `save(p)` | RPC `save_project(id, doc, expected_version)` | `PUT /projects/:id` + `If-Match: version` |
| `remove(id)` | soft delete (`deleted_at`), owner only | `DELETE /projects/:id` |

---

## 9. Moving existing browser projects

1. After the first sign-in, if `pmt_projects_v1` has projects: "You have 3 projects saved in this browser. Upload them to your account?"
2. Each upload becomes a project owned by the user; local copies are kept until the upload is confirmed, then marked as uploaded.
3. Team member emails become **draft** invites; nothing is sent until the owner clicks Invite.
4. JSON export/import keeps working in both modes.

**Local mode** (no account, this browser only) can stay as a "try it" option, or be removed once accounts exist. *Decision needed, see §12.*

---

## 10. Security and privacy checklist

- RLS turned on for **every** table; deny by default; tests for each role.
- Only the public "anon" key in the frontend. The service key lives only in Edge Functions / CI secrets, never in the repo.
- Server-side validation: document size limit, required fields, roles from an allow-list.
- Soft delete + 30-day restore for projects; daily database backups.
- Audit log of sensitive actions: invite, role change, delete, ownership transfer, methodology change.
- Emails of team members are visible only to people in that project.
- Privacy policy and terms pages before real users sign up; "download my data" and "delete my account".
- Separate **development** and **production** backends; database changes as SQL migration files in the repo.

---

## 11. Phased rollout

| Phase | Delivers | Done when |
|---|---|---|
| **0. Prepare** (frontend only, no backend) | `PMT.auth` with a local stub, `PMT.can`, `version` on projects, `userId` / `accessRole` fields on members, account pages as UI shells | Everything works exactly as today in local mode |
| **1. Accounts** | Supabase project, sign up/in/out, reset, Google sign-in, `ApiAdapter`, upload of local projects; owner-only access | A user can sign in on two devices and see the same projects |
| **2. Sharing** | Invitations by email, five access roles at project level, Team screen with statuses, conflict (409) message, audit log | A PM invites a Viewer who can see but not change anything, and the database enforces it |
| **3. Fine-grained RBAC** | Split tables, "members edit own items", comments, per-item conflict handling | A Member can update their tasks while a PM re-plans the Gantt at the same time |
| **4. Collaboration & hardening** | Realtime updates, presence, notifications (assigned, due soon, invite), 2FA for Owners/Admins, monitoring | Live updates between users; Owners protected by 2FA |

Phase 0 can start now without any backend, and it removes most of the risk from phase 1.

---

## 12. Decisions needed before phase 1

1. **Backend:** Supabase (recommended), a custom Node + Postgres API, or Firebase?
2. **Sign-in methods at launch:** email + password only, or also Google and/or Microsoft?
3. **Local mode:** keep "use without an account (this browser only)", or require an account for the Project Tool?
4. **Ownership model:** personal projects only, or **workspaces** (a school/company owns projects, with workspace admins)? Workspaces change the tables, so it's better to decide early.
5. **Domain and email sender:** stay on `github.io`, or use a custom domain (needed for branded invite emails and same-site cookies later)?
