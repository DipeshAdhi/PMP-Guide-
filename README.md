# PM Ready

A free, static website for getting **project-management ready**: learn how projects work step by step, or go straight to the tools and manage a project.

No backend, no build step. Everything runs in the browser, and progress and boards are saved in the visitor's own browser (`localStorage`).

## Two sides

| Side | For | Start at |
|---|---|---|
| **Learn & practise** | People learning project management | `learn/index.html` |
| **Workspace** | People who just want the tools | `workspace/index.html` |

The home page (`index.html`) lets visitors choose a side.

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

### Workspace
Tools that share the Scholar Academy example project:

- Task board with WBS tree and milestones · RACI matrix
- Critical path (CPM) with PERT · Gantt chart · Milestone chart
- Scrum board (with role-based views) · DSDM · Extreme Programming

## Folder structure

```
index.html            Home: choose Learn or Workspace
learn/                Course, practice, and the learning tools
  index.html            8-module course
  practice.html         Readiness, quiz links, formula sheet
  four-pillars.html     Module 1 tool
  triple-constraint.html Module 2 tool
  practice-lab.html     Process groups, order challenge, quiz, scenarios
  simulator.html        Project decision simulator
workspace/            Project tools
  index.html            Workspace hub
  task-board.html  raci.html  milestones.html  gantt.html  cpm.html
  scrum.html  dsdm.html  xp.html
assets/
  css/base.css          Shared design tokens and components
  css/agile.css         Shared styles for the agile pages
  js/site-nav.js        Shared navigation + course progress (every page loads it)
  js/schedule.js        Example schedule + critical path calculation
  js/agile.js           Agile Manifesto values/principles + helpers
docs/                 Older design notes (historical)
```

Every page loads the navigation with:

```html
<script src="../assets/js/site-nav.js" data-page="gantt"></script>
```

`data-page` tells the nav which side and breadcrumb to show. Paths are resolved from the script's own location, so the site works from any folder and on GitHub Pages.

## Run locally

Any static file server works, for example:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy

Pushing to `main` deploys the whole repository to GitHub Pages (`.github/workflows/static.yml`).

## Roadmap

1. ✅ Clear study flow (Learn · Practice · Workspace)
2. Shared project data so all workspace tools edit one project
3. Methodology presets (predictive, Scrum, Kanban, DSDM, XP) that change how the tools work
4. Hybrid tailoring: choose an approach per area
5. Role-based access control (later; requires a backend)

## Note

PM Ready is an independent learning resource. It is not affiliated with or endorsed by any certification body.
