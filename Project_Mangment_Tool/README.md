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

## Gantt chart (Jira-style)

A simple issue list on the left and bars on the right:

- **List:** ▸ expand/collapse · issue key (e.g. `APP-12`) · summary · status · assignee · start · due · ✓ done tick. Parents show subtask progress ("2/3"); deliverables/epics show a progress bar and their date span.
- **Bars:** drag to move, drag either end to change start/due, click an empty row to schedule an item, click a bar to open it.
- **Dependencies:** drag the ● at a bar's end onto another bar ("that item waits for this one"). Arrows turn red when a date breaks a dependency; **Fix** moves later items so every dependency holds. Click an arrow to remove it.
- **Subtasks:** ＋ on a row adds a subtask beneath it; "＋ Create" rows add items to any deliverable/epic.
- **Layouts:** ☰ List (table only, full width) · ☰▦ List + chart · ▦ Chart (key + summary + bars).
- **Resizable columns:** drag a column header's edge (Key, Summary, Status, Assignee, Start, Due) or use ← → on it; double-click resets. The handle on the table's right edge widens the whole table. Widths and layout are remembered in the browser. Wider date columns show the year.
- Days / Weeks / Months zoom, Today, search, person filter, optional critical-path outline. On phones the table keeps every column and scrolls sideways.

Dates the user sets take priority. Items without dates are placed automatically from the project start and their dependencies.

## Work items, board, WBS, team

- **Item editor (Jira-style):** title and description on the left with **subtasks** (tick off, add with Enter), **dependencies** (search to add "waits for" items as chips; loop-making items are left out; "blocks" lists what waits for this item) and **milestone chips**. Details on the right: status, assignee, type, parent, start/due, estimate, priority, sprint.
- **Board quick filters:** search, people (click avatars, multi-select), deliverable/epic, type (incl. subtasks), priority (MoSCoW), due (overdue / next 7 days / no date), with "Showing X of Y" and Clear filters. Cards show due dates (red when overdue).
- **WBS list and WBS chart:** the Work view switches between the list and an org-chart style tree (project → deliverables → work packages → subtasks), coloured by status.
- **Team:** name, role, and **email** per person. **Invite** is a placeholder that records "Invite pending" until accounts exist. Template teams get example.com addresses to replace.

## Calendar (Google Calendar-style)

Every project has a **Calendar** (Month and Week views, Today / ‹ ›):

- **Events of any kind:** meeting, reminder, deadline, or other; all-day (optionally multi-day) or timed; repeat every weekday, week, or month; attendees from the team; location or meeting link; linked work item; notes.
- **Project layers** (toggle like "My calendars"): work-item due dates (or start → due spans), milestones, sprints.
- Click a day (month) or a time slot (week) to create an event; click anything to open it. A "Coming up" list shows the next two weeks.
- **Export .ics** (RFC 5545) for Google Calendar, Outlook, or Apple Calendar, including repeat rules and attendee emails.
- Template projects start with a kickoff meeting and a weekly status meeting.

## Downloads (Gantt chart, WBS, milestones)

The Gantt chart, the WBS (Work → WBS list or chart) and Milestones each have a **⬇ Download** menu with the same three formats:

| | PNG image | PDF | CSV spreadsheet |
|---|---|---|---|
| **Gantt chart** | Table, bars by status, dependency arrows (red when broken), milestones, today line, legend | The same chart on one page | Every item: key, WBS code, type, deliverable/epic, parent, status, assignee and email, dates, working days, dependencies, milestones (plus estimate, priority, sprint when used) |
| **WBS** | Org-chart tree: project → deliverables → work packages → subtasks, coloured by status, with codes and % done | The same chart on one page | WBS code, level, key, name, type, status, assignee, start, due, progress |
| **Milestones** | Milestone chart: one row per milestone with target ◆, forecast ◆, slip line, linked-work progress, today line | The same chart on one page | Target, forecast, days late, status, items done/total, linked items |

- Images are drawn on a canvas at 2× resolution.
- PDFs are written directly by `js/export.js` (one page, 842 pt wide, height follows the chart, the chart embedded as JPEG): no library, no print dialog.
- CSVs are UTF-8 with a BOM so Excel opens them correctly.

The **Milestones** view also shows the milestone chart on screen above the list.

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
js/views-gantt.js   Gantt chart: Jira-style list + draggable bars, dependencies, subtasks, PNG/CSV/PDF export
js/views-calendar.js Calendar: month/week, events, project layers, .ics export
js/export.js        Shared export helpers: canvas drawing, PNG, one-page PDF writer, CSV, ⬇ Download menu
js/views-exports.js Milestone chart data + WBS and milestone PNG/PDF/CSV downloads
```

Plain HTML/CSS/JS, no build step. Scripts are classic (not ES modules) so pages also open from the file system.

## Data model (for the backend design)

One document per project:

```js
Project {
  id, version, name, description, startDate /* YYYY-MM-DD */, template,
  method: { mode: 'single', key } | { mode: 'hybrid', preset, caps: { planning, delivery, prioritisation, change, tracking } },
  settings: { iterationDays, wipLimit, tools: { wbs, iterations, timeline, schedule, milestones, changes, moscow, wip } /* extra tools */ },
  members:    [{ id, name, role, email, invite /* 'pending' until accounts exist */ }],
  key, nextNumber,                     /* issue keys: KEY-1, KEY-2, ... */
  items:      [{ id, kind: 'group' | 'item', number, title, description, type,
                 parentId /* group, or another item = subtask */, order, rank, startDate, dueDate,
                 status: 'backlog'|'todo'|'doing'|'review'|'done', assigneeId,
                 estimate /* points */, duration /* working days */, deps: [itemId], moscow,
                 iterationId, startedAt, doneAt, createdAt, raci /* groups: { memberId: 'R'|'A'|'C'|'I' } */ }],
  milestones: [{ id, name, targetDate, itemIds: [itemId] }],
  iterations: [{ id, name, goal, start, end, status: 'planned'|'active'|'closed', committed, velocity, closedAt }],
  changes:    [{ id, title, reason, scope, schedule, cost /* 0–3 */, requestedBy, status: 'proposed'|'approved'|'rejected', decisionNote, decidedAt, itemId, createdAt }],
  risks:      [{ id, title, probability, impact /* 1–5 */, ownerId, response, status: 'open'|'closed', createdAt }],
  events:     [{ id, title, kind: 'meeting'|'reminder'|'deadline'|'other', allDay, date, endDate, start, end /* HH:MM */,
                 repeat: 'none'|'weekdays'|'weekly'|'monthly', attendees: [memberId], itemId, location, description, createdAt }],
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

The full plan for accounts, sign-in, roles, invitations and the backend is in [docs/auth-and-backend-plan.md](docs/auth-and-backend-plan.md).

A server version can implement the same four methods with `fetch` (e.g. `GET /projects`, `GET /projects/:id`, `PUT /projects/:id`, `DELETE /projects/:id`) without changing any screen. Things to add with the backend:

- **Accounts and role-based access** (planned): members already have ids and roles, so permissions can be attached to them.
- **Conflict handling**: `updatedAt` is already on every save; the server can reject stale writes.
- **Real-time updates**: today, other tabs in the same browser refresh automatically (storage events); a backend would push changes between users.
- **Finer-grained endpoints** (per item, per comment) once projects get large.
