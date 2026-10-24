/* ===================================================================
   Shared site navigation + course progress.
   Every page includes, right after <body>:
       <script src="../assets/js/site-nav.js" data-page="gantt"></script>
   The script inserts the nav in its place.

   The site has two sides:
     Learn         – the course (learn/), practice, and interactive learning tools (workspace/)
     Project Tool  – a separate app for running real projects (Project_Mangment_Tool/),
                     which has its own navigation and does not load this script
   When a page is opened from a course module (?m=4), a bar links back
   to that module and the module's "Try" step is marked as done.
   =================================================================== */
(function () {
    const script = document.currentScript;
    // Site root = two levels above assets/js/, so links work from any folder, on any host
    const ROOT = new URL('../../', script.src).href;
    const url = path => ROOT + path;

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

    // side: which half of the site · section: which nav item is current
    const PAGES = {
        home: { side: 'home' },
        learn: { side: 'learn', section: 'course' },
        practice: { side: 'learn', section: 'practice' },
        'four-pillars': { side: 'learn', section: 'course', title: 'Four pillars' },
        'triple-constraint': { side: 'learn', section: 'course', title: 'Triple constraint tool' },
        'practice-lab': { side: 'learn', section: 'practice', title: 'Practice lab' },
        simulator: { side: 'learn', section: 'practice', title: 'Project simulator' },
        // The interactive learning tools (workspace/) belong to the Learn side
        workspace: { side: 'learn', section: 'tools' },
        'task-board': { side: 'learn', section: 'tools', title: 'Task board (WBS + milestones)' },
        raci: { side: 'learn', section: 'tools', title: 'RACI matrix' },
        milestones: { side: 'learn', section: 'tools', title: 'Milestones' },
        gantt: { side: 'learn', section: 'tools', title: 'Gantt chart' },
        cpm: { side: 'learn', section: 'tools', title: 'Critical path (CPM)' },
        scrum: { side: 'learn', section: 'tools', title: 'Scrum board' },
        dsdm: { side: 'learn', section: 'tools', title: 'DSDM' },
        xp: { side: 'learn', section: 'tools', title: 'Extreme Programming' }
    };
    const SECTIONS = {
        course: { label: 'Course', href: 'learn/index.html' },
        practice: { label: 'Practice', href: 'learn/practice.html' },
        tools: { label: 'Tools', href: 'workspace/index.html' }
    };
    const PM_TOOL = 'Project_Mangment_Tool/index.html';

    // ─── Progress (per browser) ───
    const KEY = 'pmpCourse_v1'; // storage key kept so existing progress isn't lost
    function load() {
        try { return Object.assign({ read: {}, tried: {}, check: {} }, JSON.parse(localStorage.getItem(KEY)) || {}); }
        catch (e) { return { read: {}, tried: {}, check: {} }; }
    }
    function save(p) {
        try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
        // Signed in on the PM Ready server: copy progress to the account too
        if (window.PMAccount) window.PMAccount.courseChanged();
    }
    const isDone = (p, id) => !!(p.read[id] && p.tried[id] && (p.check[id] || 0) >= 2);
    window.PMCourse = {
        COURSE,
        ROOT,
        url,
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
    const page = PAGES[script.dataset.page] || { side: 'home' };
    const fromModule = Number(new URLSearchParams(location.search).get('m')) || null;
    if (fromModule && COURSE.some(m => m.id === fromModule)) window.PMCourse.mark('tried', fromModule);

    const css = `
    .sn-bar { background: #2C3E50; border-bottom: 3px solid #FFB700; font-family: 'Inter', system-ui, sans-serif; position: relative; z-index: 60; }
    .sn-bar.ws { border-bottom-color: #20B2AA; }
    .sn-inner { max-width: 1200px; margin: 0 auto; padding: 0.75rem 1.5rem; display: flex; align-items: center; gap: 1.2rem; }
    .sn-bar a.sn-logo { font-family: 'Syne', 'Inter', sans-serif; font-weight: 800; font-size: 1.25rem; color: #FFB700; text-decoration: none; white-space: nowrap; background: none; -webkit-text-fill-color: #FFB700; }
    .sn-side { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.2rem 0.55rem; border-radius: 6px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); white-space: nowrap; }
    .sn-links { display: flex; gap: 0.3rem; margin: 0; padding: 0; list-style: none; flex: 1; }
    .sn-bar a.sn-link { color: rgba(255,255,255,0.82); text-decoration: none; font-weight: 600; font-size: 0.95rem; padding: 0.45rem 0.9rem; border-radius: 8px; display: inline-block; }
    .sn-bar a.sn-link:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .sn-bar a.sn-link[aria-current] { color: #2C3E50; background: #FFB700; }
    .sn-bar.ws a.sn-link[aria-current] { background: #20B2AA; color: #fff; }
    .sn-bar a.sn-link::after { display: none; }
    .sn-right { display: flex; align-items: center; gap: 1rem; margin-left: auto; }
    .sn-progress { color: rgba(255,255,255,0.75); font-size: 0.82rem; text-decoration: none; white-space: nowrap; }
    .sn-progress strong { color: #FFB700; }
    .sn-progress:hover { color: #fff; }
    .sn-bar a.sn-switch { color: #fff; text-decoration: none; font-size: 0.82rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); border-radius: 20px; padding: 0.3rem 0.8rem; white-space: nowrap; }
    .sn-bar a.sn-switch:hover { border-color: #FFB700; color: #FFB700; }
    .sn-crumbs { background: #1a2942; font-family: 'Inter', system-ui, sans-serif; font-size: 0.85rem; }
    .sn-crumbs .sn-inner { padding: 0.5rem 1.5rem; gap: 0.5rem; color: rgba(255,255,255,0.6); }
    .sn-crumbs a { color: rgba(255,255,255,0.85); text-decoration: none; }
    .sn-crumbs a:hover { color: #FFB700; }
    .sn-crumbs span[aria-current] { color: #fff; font-weight: 600; }
    .sn-module { background: #FFF6E0; border-bottom: 1px solid #F0DDA8; font-family: 'Inter', system-ui, sans-serif; font-size: 0.9rem; color: #3D3D3D; }
    .sn-module .sn-inner { padding: 0.6rem 1.5rem; gap: 0.8rem; flex-wrap: wrap; }
    .sn-module a { margin-left: auto; background: #2C3E50; color: #fff; text-decoration: none; font-weight: 600; padding: 0.4rem 0.9rem; border-radius: 8px; white-space: nowrap; }
    .sn-module a:hover { background: #FF6B5B; }
    .sn-bar a:focus-visible, .sn-crumbs a:focus-visible, .sn-module a:focus-visible, .sn-acct summary:focus-visible { outline: 3px solid #FFB700; outline-offset: 2px; }
    .sn-bar a.sn-signin { color: #2C3E50; background: #FFB700; text-decoration: none; font-size: 0.82rem; font-weight: 700; border-radius: 20px; padding: 0.3rem 0.85rem; white-space: nowrap; }
    .sn-acct { position: relative; }
    .sn-acct summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 0.45rem; color: #fff; font-size: 0.85rem; font-weight: 600; }
    .sn-acct summary::-webkit-details-marker { display: none; }
    .sn-av { width: 28px; height: 28px; border-radius: 50%; background: #FFB700; color: #2C3E50; display: inline-grid; place-items: center; font-weight: 800; font-size: 0.75rem; }
    .sn-menu { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); min-width: 210px; padding: 0.4rem; z-index: 80; }
    .sn-menu .who { padding: 0.5rem 0.7rem; font-size: 0.78rem; color: #6B7280; border-bottom: 1px solid #EEF0F2; margin-bottom: 0.3rem; overflow-wrap: anywhere; }
    .sn-menu a, .sn-menu button { display: block; width: 100%; text-align: left; padding: 0.5rem 0.7rem; border-radius: 6px; color: #1F2A37; text-decoration: none; font: 600 0.88rem 'Inter', system-ui, sans-serif; background: none; border: 0; cursor: pointer; }
    .sn-menu a:hover, .sn-menu button:hover { background: #F3F4F6; }
    @media (max-width: 680px) {
        .sn-inner { padding: 0.6rem 1rem; gap: 0.6rem; flex-wrap: wrap; }
        .sn-links { order: 3; flex-basis: 100%; }
        .sn-bar a.sn-link { padding: 0.4rem 0.7rem; font-size: 0.9rem; }
        .sn-side { display: none; }
        .sn-crumbs .sn-inner, .sn-module .sn-inner { padding-left: 1rem; padding-right: 1rem; }
    }`;

    const link = key => `<li><a class="sn-link" href="${url(SECTIONS[key].href)}"${page.section === key ? ' aria-current="page"' : ''}>${SECTIONS[key].label}</a></li>`;
    let items, right, side = '';
    if (page.side === 'learn') {
        side = '<span class="sn-side">Learn</span>';
        items = link('course') + link('practice') + link('tools');
        right = `<a class="sn-progress" href="${url('learn/index.html')}" title="Course progress">Course: <strong>${window.PMCourse.completed()}/${COURSE.length}</strong></a>
                 <a class="sn-switch" href="${url(PM_TOOL)}">Open the Project Tool →</a>`;
    } else {
        items = `<li><a class="sn-link" href="${url('learn/index.html')}">Learn</a></li><li><a class="sn-link" href="${url(PM_TOOL)}">Project Tool</a></li>`;
        right = '';
    }

    let html = `<style>${css}</style>
    <div class="sn-bar" role="navigation" aria-label="Main">
        <div class="sn-inner">
            <a class="sn-logo" href="${url('index.html')}">PM Ready</a>
            ${side}
            <ul class="sn-links">${items}</ul>
            <div class="sn-right">${right}</div>
        </div>
    </div>`;

    if (page.title) {
        const sec = SECTIONS[page.section];
        html += `<div class="sn-crumbs" aria-label="Breadcrumb"><div class="sn-inner">
            <a href="${url(sec.href)}">${sec.label}</a><span aria-hidden="true">›</span><span aria-current="page">${page.title}</span>
        </div></div>`;
    }

    const mod = COURSE.find(m => m.id === fromModule);
    if (mod) {
        html += `<div class="sn-module"><div class="sn-inner">
            <span>📘 <strong>Module ${mod.id}: ${mod.title}</strong>. You're doing the "Try" step. Come back when you're done.</span>
            <a href="${url('learn/index.html')}#m${mod.id}">← Back to the module</a>
        </div></div>`;
    }

    script.insertAdjacentHTML('beforebegin', html);

    // ─── Account (only when the site runs on the PM Ready server) ───
    const rightEl = script.previousElementSibling?.matches?.('.sn-bar') ? script.previousElementSibling.querySelector('.sn-right')
        : document.querySelector('.sn-bar .sn-right');
    function showAccount() {
        const A = window.PMAccount;
        A.available().then(async ok => {
            if (!ok || !rightEl) return;
            const me = await A.me();
            const box = document.createElement('div');
            if (!me) {
                box.innerHTML = `<a class="sn-signin" href="${A.signInUrl()}">Sign in</a>`;
            } else {
                const u = me.user;
                const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const ini = u.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
                box.innerHTML = `<details class="sn-acct"><summary aria-label="Account menu for ${esc(u.name)}"><span class="sn-av" aria-hidden="true">${esc(ini)}</span></summary>
                    <div class="sn-menu" role="menu"><div class="who"><strong>${esc(u.name)}</strong><br>${esc(u.email)}</div>
                    <a role="menuitem" href="${url('account/index.html')}">My account</a>
                    <a role="menuitem" href="${url(PM_TOOL)}">My projects</a>
                    ${u.platformRole === 'admin' ? `<a role="menuitem" href="${url('admin/index.html')}">Admin dashboard</a>` : ''}
                    <button role="menuitem" type="button" data-signout>Sign out</button></div></details>`;
                box.querySelector('[data-signout]').addEventListener('click', () => A.signOut());
                document.addEventListener('click', e => { const d = box.querySelector('details'); if (d.open && !d.contains(e.target)) d.open = false; });
                // Progress from another device: show it on this page too (once)
                const sync = await A.syncCourse();
                if (sync && sync.changedLocal && !sessionStorage.getItem('pmCourseSynced')) {
                    sessionStorage.setItem('pmCourseSynced', '1');
                    location.reload();
                }
            }
            rightEl.appendChild(box);
        });
    }
    if (window.PMAccount) showAccount();
    else {
        const s = document.createElement('script');
        s.src = url('assets/js/account.js');
        s.onload = showAccount;
        document.head.appendChild(s);
    }
})();
