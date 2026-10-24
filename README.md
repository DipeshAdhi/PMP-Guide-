# PM Ready

A free, static website for getting **project-management ready**: learn how projects work step by step, or open the Project Tool and run a real project.

No build step. On a static host (GitHub Pages) everything runs in the browser and is saved in the visitor's own browser (`localStorage`). Run with the **PM Ready server** ([backend/](backend/README.md): Node.js + MongoDB) to add accounts: course progress follows the user, projects are shared with a team or a company, and an admin dashboard shows usage.

## Two sides

| Side | For | Start at |
|---|---|---|
| **Learn & practise** | People learning project management | `learn/index.html` |
| **Project Tool** | People running a real project | `Project_Mangment_Tool/index.html` |

The home page (`index.html`) lets visitors choose a side. The Project Tool is a separate app with its own README: [Project_Mangment_Tool/README.md](Project_Mangment_Tool/README.md).

### Learn
An 8-module course. Every module follows the same steps: **Read** a short lesson → **Try it** in an interactive tool → **Check** with 3 questions.

1. Projects and the four pillars
2. The triple constraint
3. Life cycles and process groups
4. Scope: WBS and MoSCoW
5. Schedule: milestones, CPM, Gantt
6. People: RACI, stakeholders, conflict
7. Agile: Scrum, Kanban, XP, DSDM
8. Monitoring, change, and closing

**Practice** (`learn/practice.html`) shows a readiness score from the module checks and links to the quiz, scenarios, simulator, and a formula sheet.

### Interactive tools (part of Learn)
Hands-on demos that share the Scholar Academy example project:

- Task board with WBS tree and milestones · RACI matrix
- Critical path (CPM) with PERT · Gantt chart · Milestone chart
- Scrum board (with role-based views) · DSDM · Extreme Programming

## Folder structure

```
index.html            Home: choose Learn or the Project Tool
learn/                Course, practice, and the learning tools
  index.html            8-module course
  practice.html         Readiness, quiz links, formula sheet
  four-pillars.html     Module 1 tool
  triple-constraint.html Module 2 tool
  practice-lab.html     Process groups, order challenge, quiz, scenarios
  simulator.html        Project decision simulator
workspace/            Interactive learning tools
  index.html            Tools hub
  task-board.html  raci.html  milestones.html  gantt.html  cpm.html
  scrum.html  dsdm.html  xp.html
assets/
  css/base.css          Shared design tokens and components
  css/agile.css         Shared styles for the agile pages
  js/site-nav.js        Shared navigation + course progress (every page loads it)
  js/schedule.js        Example schedule + critical path calculation
  js/agile.js           Agile Manifesto values/principles + helpers
  js/account.js         Sign-in state, API client, course progress sync (server mode only)
Project_Mangment_Tool/ The Project Tool app (see its README)
account/              Sign in / create account (personal or company), My account, companies
admin/                Admin dashboard (platform admins only)
backend/              PM Ready server: Express API + MongoDB (see backend/README.md)
docs/                 Older design notes (historical)
```

Every page loads the navigation with:

```html
<script src="../assets/js/site-nav.js" data-page="gantt"></script>
```

`data-page` tells the nav which side and breadcrumb to show. Paths are resolved from the script's own location, so the site works from any folder and on GitHub Pages.

## Run locally

With accounts (needs MongoDB at `mongodb://localhost:27017/`; details in [backend/README.md](backend/README.md)):

```bash
cd backend && npm install && npm start
```

Then open http://localhost:4000.

Without accounts, any static file server works, for example `python3 -m http.server 8765`, then open http://localhost:8765.

## Deploy

Pushing to `main` deploys the whole repository to GitHub Pages (`.github/workflows/static.yml`). GitHub Pages only serves static files, so the live site runs in browser-only mode; accounts need the server hosted somewhere (with a hosted MongoDB, e.g. Atlas).

## Roadmap

1. ✅ Clear study flow (Learn · Practice · Interactive tools)
2. ✅ Project Tool: one project shared by all its screens
3. ✅ Methodology presets (Predictive, Scrum, Kanban, XP, DSDM) that change how the tool works
4. ✅ Hybrid: presets or a custom choice per area
5. ✅ Backend (MongoDB): accounts (personal or company), shared projects, course progress per account, admin dashboard
6. ✅ Access roles per project (owner, manager, member, viewer) and per company (owner, admin, member)
7. Email invitations and password reset by email, email verification, 2FA
8. Finer roles (e.g. members edit only their own items), hosting the server, PostgreSQL

## Note

PM Ready is an independent learning resource. It is not affiliated with or endorsed by any certification body.
