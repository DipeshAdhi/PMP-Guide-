/* ===================================================================
   Shared site navigation + course progress.
   Every page includes:  <script src="site-nav.js" data-page="gantt"></script>
   right after <body>. The script inserts the nav in its place.

   Three sections only: Learn · Workspace · Exam prep.
   When a page is opened from a course module (?m=4), a bar links back
   to that module and the module's "Try" step is marked as done.
   =================================================================== */
(function () {
    const COURSE = [
        { id: 1, title: 'Projects and the four pillars' },
        { id: 2, title: 'The triple constraint' },
        { id: 3, title: 'Life cycles and process groups' },
        { id: 4, title: 'Scope: WBS and MoSCoW' },
        { id: 5, title: 'Schedule: milestones, CPM, Gantt' },
        { id: 6, title: 'People: RACI, stakeholders, conflict' },
        { id: 7, title: 'Agile: Scrum, Kanban, XP, DSDM' },
        { id: 8, title: 'Monitoring, change, and closing' }
    ];

    const PAGES = {
        index: { section: 'home' },
        learn: { section: 'learn' },
        exam: { section: 'exam' },
        'pm-tools': { section: 'workspace' },
        dashboard: { section: 'learn', title: 'Four pillars', module: 1 },
        'triple-constraint-advanced': { section: 'learn', title: 'Triple constraint tool', module: 2 },
        board: { section: 'workspace', title: 'Task board (WBS + milestones)' },
        raci: { section: 'workspace', title: 'RACI matrix' },
        milestones: { section: 'workspace', title: 'Milestones' },
        gantt: { section: 'workspace', title: 'Gantt chart' },
        cpm: { section: 'workspace', title: 'Critical path (CPM)' },
        'agile-board': { section: 'workspace', title: 'Scrum board' },
        dsdm: { section: 'workspace', title: 'DSDM' },
        xp: { section: 'workspace', title: 'Extreme Programming' },
        'game-interactive': { section: 'exam', title: 'Practice lab' },
        'project-simulator': { section: 'exam', title: 'Project simulator' }
    };
    const SECTIONS = {
        learn: { label: 'Learn', href: 'learn.html' },
        workspace: { label: 'Workspace', href: 'pm-tools.html' },
        exam: { label: 'Exam prep', href: 'exam.html' }
    };

    // ─── Progress (per browser) ───
    const KEY = 'pmpCourse_v1';
    function load() {
        try { return Object.assign({ read: {}, tried: {}, check: {} }, JSON.parse(localStorage.getItem(KEY)) || {}); }
        catch (e) { return { read: {}, tried: {}, check: {} }; }
    }
    function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
    const isDone = (p, id) => !!(p.read[id] && p.tried[id] && (p.check[id] || 0) >= 2);
    window.PMPCourse = {
        COURSE,
        load,
        save,
        isDone,
        completed: () => { const p = load(); return COURSE.filter(m => isDone(p, m.id)).length; },
        next: () => { const p = load(); return COURSE.find(m => !isDone(p, m.id)) || null; },
        mark(kind, id, value = true) {
            const p = load();
            if (kind === 'check') p.check[id] = Math.max(p.check[id] || 0, value);
            else p[kind][id] = value;
            save(p);
            return p;
        }
    };

    // ─── Render ───
    const script = document.currentScript;
    const pageId = script.dataset.page || location.pathname.split('/').pop().replace('.html', '') || 'index';
    const page = PAGES[pageId] || { section: '' };
    const params = new URLSearchParams(location.search);
    const fromModule = Number(params.get('m')) || null;
    if (fromModule && COURSE.some(m => m.id === fromModule)) window.PMPCourse.mark('tried', fromModule);
    const done = window.PMPCourse.completed();

    const css = `
    .sn-bar { background: #2C3E50; border-bottom: 3px solid #FFB700; font-family: 'Inter', system-ui, sans-serif; position: relative; z-index: 60; }
    .sn-inner { max-width: 1200px; margin: 0 auto; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1.5rem; }
    .sn-bar a.sn-logo { font-family: 'Syne', 'Inter', sans-serif; font-weight: 800; font-size: 1.25rem; color: #FFB700; text-decoration: none; white-space: nowrap; background: none; -webkit-text-fill-color: #FFB700; }
    .sn-links { display: flex; gap: 0.3rem; margin: 0; padding: 0; list-style: none; flex: 1; }
    .sn-bar a.sn-link { color: rgba(255,255,255,0.82); text-decoration: none; font-weight: 600; font-size: 0.95rem; padding: 0.45rem 0.9rem; border-radius: 8px; display: inline-block; }
    .sn-bar a.sn-link:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .sn-bar a.sn-link[aria-current] { color: #2C3E50; background: #FFB700; }
    .sn-bar a.sn-link::after { display: none; }
    .sn-progress { color: rgba(255,255,255,0.75); font-size: 0.82rem; text-decoration: none; white-space: nowrap; }
    .sn-progress strong { color: #FFB700; }
    .sn-progress:hover { color: #fff; }
    .sn-crumbs { background: #1a2942; font-family: 'Inter', system-ui, sans-serif; font-size: 0.85rem; }
    .sn-crumbs .sn-inner { padding: 0.5rem 1.5rem; gap: 0.5rem; color: rgba(255,255,255,0.6); }
    .sn-crumbs a { color: rgba(255,255,255,0.85); text-decoration: none; }
    .sn-crumbs a:hover { color: #FFB700; }
    .sn-crumbs span[aria-current] { color: #fff; font-weight: 600; }
    .sn-module { background: #FFF6E0; border-bottom: 1px solid #F0DDA8; font-family: 'Inter', system-ui, sans-serif; font-size: 0.9rem; color: #3D3D3D; }
    .sn-module .sn-inner { padding: 0.6rem 1.5rem; gap: 0.8rem; flex-wrap: wrap; }
    .sn-module a { margin-left: auto; background: #2C3E50; color: #fff; text-decoration: none; font-weight: 600; padding: 0.4rem 0.9rem; border-radius: 8px; white-space: nowrap; }
    .sn-module a:hover { background: #FF6B5B; }
    .sn-bar a:focus-visible, .sn-crumbs a:focus-visible, .sn-module a:focus-visible { outline: 3px solid #FFB700; outline-offset: 2px; }
    @media (max-width: 640px) {
        .sn-inner { padding: 0.6rem 1rem; gap: 0.6rem; flex-wrap: wrap; }
        .sn-links { order: 3; flex-basis: 100%; }
        .sn-bar a.sn-link { padding: 0.4rem 0.7rem; font-size: 0.9rem; }
        .sn-progress { margin-left: auto; }
        .sn-crumbs .sn-inner, .sn-module .sn-inner { padding-left: 1rem; padding-right: 1rem; }
    }`;

    const links = Object.entries(SECTIONS).map(([key, s]) =>
        `<li><a class="sn-link" href="${s.href}"${page.section === key ? ' aria-current="page"' : ''}>${s.label}</a></li>`).join('');

    let html = `<style>${css}</style>
    <div class="sn-bar" role="navigation" aria-label="Main">
        <div class="sn-inner">
            <a class="sn-logo" href="index.html">PMP Guide</a>
            <ul class="sn-links">${links}</ul>
            <a class="sn-progress" href="learn.html" title="Course progress">Course: <strong>${done}/${COURSE.length}</strong> modules</a>
        </div>
    </div>`;

    if (page.title && SECTIONS[page.section]) {
        const sec = SECTIONS[page.section];
        html += `<div class="sn-crumbs" aria-label="Breadcrumb"><div class="sn-inner">
            <a href="${sec.href}">${sec.label}</a><span aria-hidden="true">›</span><span aria-current="page">${page.title}</span>
        </div></div>`;
    }

    const mod = COURSE.find(m => m.id === fromModule);
    if (mod) {
        html += `<div class="sn-module"><div class="sn-inner">
            <span>📘 <strong>Module ${mod.id}: ${mod.title}</strong>. You're doing the "Try" step. Come back when you're done.</span>
            <a href="learn.html#m${mod.id}">← Back to the module</a>
        </div></div>`;
    }

    script.insertAdjacentHTML('beforebegin', html);
})();
