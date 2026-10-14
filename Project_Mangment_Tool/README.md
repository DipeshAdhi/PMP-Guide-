# PM Ready · Project Tool

A working project management tool, separate from the learning side of PM Ready. Its job is to **run real projects**: create a project, choose how it will be run, then assign, plan, and track the work.

No backend yet. Projects are saved in the browser (`localStorage`). Export/import (JSON) moves a project between browsers.

## Flow

1. **Projects** (`index.html`): list of your projects, import, and **＋ New project**.
2. **New project wizard**
   1. Name, description, start date
   2. Template: Blank, Mobile app launch, School management system, Website redesign, Conference or event
   3. Methodology: **one** (Predictive, Scrum, Kanban, XP, DSDM) or **hybrid** (preset or custom mix)
   4. Team: names and roles
3. **Project** (`project.html?id=…`): the screens depend on the methodology.

## How the methodology changes the tool

Every method is reduced to five area choices. Hybrids pick each area separately.

| Area | Options | Turns on |
|---|---|---|
| Planning | Up-front plan · Rolling backlog | WBS tree, schedule, and milestones · ranked backlog |
| Delivery | Phases · Iterations · Continuous flow | — · sprint/timebox planning, burndown, velocity · WIP limits |
| Prioritisation | Fixed scope · Ordered backlog · MoSCoW | — · rank ▲▼ · M/S/C/W with 60% Must check |
| Change | Change requests · Reprioritise | Change request log with approval · (backlog only) |
| Tracking | Schedule · Burndown · Flow | Gantt + critical path · burndown · cycle time and throughput |

Switching methodology in **Settings** keeps all data; only screens and rules change.

## Extra tools (any methodology)

Settings → **Tools** (and "Add more tools" in the wizard) lets a project manager switch on any tool, whatever the methodology. Tools the methodology includes are locked on; the rest can be added or removed, and hiding a tool keeps its data.

| Tool | What it adds |
|---|---|
| 🌳 WBS | Deliverables with WBS codes, a tree view (Backlog / WBS toggle on agile projects), and RACI |
| 🔁 Sprints / iterations | Sprint planning (several sprints ahead), goal, burndown, velocity |
| 🗓️ Timeline | Sprints, milestones, and deliverables/epics on the calendar |
| 📊 Gantt & critical path | Durations, dependencies, forecast finish, critical path |
| 🏁 Milestones | Target dates, reached when linked work is done |
| 📝 Change requests | Propose, assess, approve or reject changes |
| 🎯 MoSCoW | Must/Should/Could/Won't with the 60% Must check |
| 🚦 WIP limit | Cap on items in progress |

Switching a tool on fills in what it needs (e.g. Gantt gives items a duration; Sprints gives them a point estimate).

## Sprints on the timeline

The **Timeline** view lays out every sprint (done, active, planned) on the calendar, with milestones and a bar for each deliverable/epic spanning the sprints that hold its work ("+N unplanned" shows what isn't in a sprint yet). **Plan 3 sprints ahead** creates consecutive sprints; each can be planned in advance, but they start in order.

## Code layout

```
index.html          Projects list + new-project wizard
project.html        Project app shell (sidebar, top bar, item editor)
css/app.css         App styles
js/store.js         Storage adapter (localStorage now; swap for an API later)
js/schedule.js      Working-day dates + critical path method
js/methods.js       Methodologies, hybrid presets, features(), method picker UI
js/templates.js     Prebuilt templates + createProject()
js/ui.js            Small UI helpers (escape, toast, avatars, download)
js/app.js           Core: load/save, routing, event delegation, item editor
js/views-work.js    Overview, Work (WBS/backlog), Board
js/views-plan.js    Iterations, Schedule, Milestones, Team, Changes, Risks, Settings
js/views-timeline.js Timeline (sprints, milestones, deliverables on the calendar)
```

Plain HTML/CSS/JS, no build step. Scripts are classic (not ES modules) so pages also open from the file system.

## Data model (for the backend design)

One document per project:

```js
Project {
  id, version, name, description, startDate /* YYYY-MM-DD */, template,
  method: { mode: 'single', key } | { mode: 'hybrid', preset, caps: { planning, delivery, prioritisation, change, tracking } },
  settings: { iterationDays, wipLimit, tools: { wbs, iterations, timeline, schedule, milestones, changes, moscow, wip } /* extra tools */ },
  members:    [{ id, name, role }],
  items:      [{ id, kind: 'group' | 'item', title, description, type, parentId, order, rank,
                 status: 'backlog'|'todo'|'doing'|'review'|'done', assigneeId,
                 estimate /* points */, duration /* working days */, deps: [itemId], moscow,
                 iterationId, startedAt, doneAt, createdAt, raci /* groups: { memberId: 'R'|'A'|'C'|'I' } */ }],
  milestones: [{ id, name, targetDate, itemIds: [itemId] }],
  iterations: [{ id, name, goal, start, end, status: 'planned'|'active'|'closed', committed, velocity, closedAt }],
  changes:    [{ id, title, reason, scope, schedule, cost /* 0–3 */, requestedBy, status: 'proposed'|'approved'|'rejected', decisionNote, decidedAt, itemId, createdAt }],
  risks:      [{ id, title, probability, impact /* 1–5 */, ownerId, response, status: 'open'|'closed', createdAt }],
  activity:   [{ at, text }],
  createdAt, updatedAt
}
```

## Moving to a backend

All reads and writes go through `PMT.store`, and every method already returns a Promise:

```js
PMT.store = {
  list()          // → summaries for the projects page
  get(id)         // → full project
  save(project)   // → saved project (sets updatedAt)
  remove(id)
};
```

A server version can implement the same four methods with `fetch` (e.g. `GET /projects`, `GET /projects/:id`, `PUT /projects/:id`, `DELETE /projects/:id`) without changing any screen. Things to add with the backend:

- **Accounts and role-based access** (planned): members already have ids and roles, so permissions can be attached to them.
- **Conflict handling**: `updatedAt` is already on every save; the server can reject stale writes.
- **Real-time updates**: today, other tabs in the same browser refresh automatically (storage events); a backend would push changes between users.
- **Finer-grained endpoints** (per item, per comment) once projects get large.
