/* ===================================================================
   Project app core: loading/saving, routing, shell, shared helpers,
   event delegation, and the work-item editor.
   Views register themselves with PMT.app.register(key, { render, mount }).
   Actions register with PMT.app.action(name, fn) and are triggered by
   data-act (click), data-change (change), and data-form (submit).
   =================================================================== */
(function () {
    const { esc, toast, avatar, STATUS, MOSCOW } = PMT.ui;
    const D = PMT.dates;
    const A = PMT.app = { P: null, F: null, view: 'overview', views: {}, actions: {}, state: {} };

    A.register = (key, def) => { A.views[key] = def; };
    A.action = (name, fn) => { A.actions[name] = fn; };

    // ─── Data helpers ───
    A.member = id => A.P.members.find(m => m.id === id) || null;
    A.item = id => A.P.items.find(i => i.id === id) || null;
    A.groups = () => A.P.items.filter(i => i.kind === 'group').sort((a, b) => a.order - b.order);
    A.work = () => A.P.items.filter(i => i.kind !== 'group');
    A.childrenOf = gid => A.work().filter(i => i.parentId === gid).sort((a, b) => a.order - b.order);
    A.ranked = () => A.work().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    // Subtasks: work items whose parent is another work item (not a deliverable/epic)
    A.isSubtask = i => !!(i.parentId && A.item(i.parentId) && A.item(i.parentId).kind !== 'group');
    A.subtasksOf = id => A.work().filter(i => i.parentId === id).sort((a, b) => a.order - b.order);
    A.topItems = () => A.ranked().filter(i => !A.isSubtask(i));   // backlog, planning: subtasks follow their parent
    A.syncSubtasks = parent => A.subtasksOf(parent.id).forEach(st => { st.iterationId = parent.iterationId || null; });
    A.keyOf = i => i.kind === 'group' ? '' : `${A.P.key}-${i.number}`;
    // Create a work item with an issue number; caller pushes it
    A.newItem = (fields = {}) => ({
        id: PMT.uid('i_'), kind: 'item', type: 'task', title: '', description: '', status: 'backlog',
        rank: A.nextRank(), order: 0, deps: [], parentId: null, assigneeId: null, estimate: null, duration: null,
        moscow: A.F.moscow ? 'S' : null, iterationId: null, number: A.P.nextNumber++, createdAt: new Date().toISOString(), ...fields
    });
    // Older projects: add keys/numbers and dates where missing
    A.migrate = () => {
        const P = A.P;
        if (!P.key) P.key = PMT.projectKey(P.name);
        if (!P.nextNumber) P.nextNumber = 1;
        if (!Array.isArray(P.events)) P.events = [];
        A.ranked().forEach(i => { if (!i.number) i.number = P.nextNumber++; });
        if (A.F.schedule) PMT.schedule.fillDates(P);
    };
    A.activeIteration = () => A.P.iterations.find(i => i.status === 'active') || null;
    // Several sprints can be planned ahead; the planning screen works on the selected one
    A.plannedIterations = () => A.P.iterations.filter(i => i.status === 'planned').sort((a, b) => a.start.localeCompare(b.start));
    A.plannedIteration = () => {
        const list = A.plannedIterations();
        return list.find(i => i.id === A.state.planIterId) || list[0] || null;
    };
    A.refreshFeatures = () => { A.F = PMT.features(A.P.method, A.P.settings.tools || {}); };
    // When a tool is switched on, give existing items the fields it needs
    A.fillForFeatures = () => {
        const P = A.P, F = A.F;
        if (F.iterations && !P.settings.iterationDays) P.settings.iterationDays = F.defaultIterationDays;
        if (F.flow && !P.settings.wipLimit) P.settings.wipLimit = 3;
        A.work().forEach(i => {
            if (F.moscow && !i.moscow) i.moscow = 'S';
            if (F.points && (i.estimate == null || i.estimate === '') && i.duration) i.estimate = PMT.pointsFor(Number(i.duration));
            if (F.schedule && !i.duration) i.duration = i.estimate ? Math.max(1, Math.round(Number(i.estimate))) : 1;
        });
        if (F.schedule) PMT.schedule.fillDates(P);
    };
    A.groupWord = () => A.F.wbs ? (A.F.hierarchy ? 'Deliverable (WBS)' : 'Deliverable / epic') : 'Epic';
    A.code = item => {
        if (!A.F.wbs) return '';
        const gs = A.groups();
        if (item.kind === 'group') return String(gs.indexOf(item) + 1);
        const parent = A.item(item.parentId);
        if (!parent) return '';
        const siblings = parent.kind === 'group' ? A.childrenOf(parent.id).filter(x => !A.isSubtask(x)) : A.subtasksOf(parent.id);
        const base = parent.kind === 'group' ? String(gs.indexOf(parent) + 1) : A.code(parent);
        return base ? `${base}.${siblings.indexOf(item) + 1}` : '';
    };
    A.groupName = item => A.item(item.parentId)?.title || '';
    A.nextRank = () => Math.max(-1, ...A.work().map(i => i.rank ?? 0)) + 1;
    A.log = text => {
        A.P.activity.push({ at: new Date().toISOString(), text });
        if (A.P.activity.length > 300) A.P.activity.splice(0, A.P.activity.length - 300);
    };

    // Status changes keep timestamps for flow metrics and burndowns
    A.setStatus = (item, status) => {
        if (item.status === status) return true;
        if (A.F.flow && status === 'doing' && item.status !== 'doing') {
            const limit = Number(A.P.settings.wipLimit) || 3;
            const inProgress = A.work().filter(i => i.status === 'doing').length;
            if (inProgress >= limit) {
                toast(`WIP limit reached: ${limit} items already in progress. Finish one first.`, 'warn');
                return false;
            }
        }
        const now = new Date().toISOString();
        if (status === 'doing' && !item.startedAt) item.startedAt = now;
        if (status === 'done') { item.doneAt = now; if (!item.startedAt) item.startedAt = now; }
        else delete item.doneAt;
        A.log(`"${item.title}" moved from ${STATUS[item.status]} to ${STATUS[status]}`);
        item.status = status;
        return true;
    };

    // ─── Saving ───
    function setSaved(error) {
        const el = document.getElementById('saved');
        if (!el) return;
        el.className = `saved ${error ? 'err' : ''}`;
        el.textContent = error ? 'Not saved' : `Saved ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    A.save = async () => {
        try { await PMT.store.save(A.P); setSaved(false); }
        catch (e) { setSaved(true); toast('Could not save: browser storage is full or blocked.', 'bad'); }
    };
    // Re-render keeps keyboard focus on the control that was used
    function focusKey(el) {
        if (!el || el === document.body) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const attrs = ['data-act', 'data-change', 'data-id', 'data-dir', 'data-col', 'data-m', 'data-v', 'data-to', 'data-tool'];
        const parts = attrs.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`);
        return parts.length ? el.tagName.toLowerCase() + parts.join('') : null;
    }
    A.commit = async (logText, toastMsg, kind) => {
        if (logText) A.log(logText);
        const key = focusKey(document.activeElement);
        render();
        if (key) document.querySelector(key)?.focus();
        if (toastMsg) toast(toastMsg, kind);
        await A.save();
    };

    // ─── Shell ───
    const ICONS = { overview: '🏠', work: '📋', board: '🗂️', calendar: '📅', iterations: '🔁', timeline: '🗓️', schedule: '📊', milestones: '🏁', team: '👥', changes: '📝', risks: '⚠️', settings: '⚙️' };
    A.viewLabel = key => key === 'work' ? A.F.workLabel : key === 'iterations' ? `${A.F.iterName}s` : PMT.VIEW_LABELS[key];

    function renderShell() {
        const P = A.P, F = A.F;
        const counts = {
            work: A.work().filter(i => i.status !== 'done').length,
            board: A.work().filter(i => i.status === 'doing').length,
            changes: P.changes.filter(c => c.status === 'proposed').length,
            risks: P.risks.filter(r => r.status === 'open').length
        };
        document.getElementById('sidebar').innerHTML = `
            <div class="brand-row"><a class="brand" href="index.html">PM Ready<span>Project Tool</span></a></div>
            <div class="proj"><strong>${esc(P.name)}</strong><span class="method">${PMT.methodIcon(P.method)} ${esc(PMT.methodName(P.method))}</span></div>
            <nav aria-label="Project">${F.views.map(v => `<a href="#${v}" ${A.view === v ? 'aria-current="page"' : ''}><span aria-hidden="true">${ICONS[v]}</span>${esc(A.viewLabel(v))}${counts[v] ? `<span class="count">${counts[v]}</span>` : ''}</a>`).join('')}</nav>
            <div class="foot"><a href="index.html">← All projects</a><a href="../index.html">PM Ready home</a></div>`;
    }

    function render() {
        if (!A.F.views.includes(A.view)) A.view = 'overview';
        renderShell();
        const def = A.views[A.view];
        const out = def.render();
        document.getElementById('viewTitle').textContent = A.viewLabel(A.view);
        document.getElementById('viewSub').textContent = out.sub || '';
        document.getElementById('view').innerHTML = out.html;
        if (def.mount) def.mount(document.getElementById('view'));
    }
    A.render = render;

    function route() {
        const v = location.hash.slice(1) || 'overview';
        A.view = A.F.views.includes(v) ? v : 'overview';
        render();
        document.getElementById('view').focus({ preventScroll: true });
        window.scrollTo(0, 0);
    }

    // ─── Event delegation ───
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled) return;
        const fn = A.actions[el.dataset.act];
        if (fn) { e.preventDefault(); fn(el, e); }
    });
    document.addEventListener('change', e => {
        const el = e.target.closest('[data-change]');
        if (el && A.actions[el.dataset.change]) A.actions[el.dataset.change](el, e);
    });
    document.addEventListener('submit', e => {
        const form = e.target.closest('[data-form]');
        if (!form || !A.actions[form.dataset.form]) return;
        e.preventDefault();
        A.actions[form.dataset.form](form, Object.fromEntries(new FormData(form)));
    });

    // ─── Work-item editor (Jira-style: content on the left, details on the right) ───
    const dlg = () => document.getElementById('itemDialog');
    const TYPES = [['task', 'Task'], ['story', 'User story'], ['bug', 'Bug']];
    const depChip = (o, removable = true) => `<span class="dchip" data-dep="${o.id}">${removable ? `<input type="hidden" name="dep" value="${o.id}">` : ''}<span class="key">${A.keyOf(o)}</span><span class="dchip-t">${esc(o.title)}</span>${removable ? `<button type="button" class="dchip-x" aria-label="Remove dependency on ${A.keyOf(o)}">✕</button>` : `<span class="pill ${o.status}">${STATUS[o.status]}</span>`}</span>`;

    A.openItem = (id, defaults = {}) => {
        const F = A.F, P = A.P;
        const it = id ? A.item(id) : null;
        const isGroup = it ? it.kind === 'group' : defaults.kind === 'group';
        const groupWord = A.groupWord();
        const head = document.getElementById('dlgTitle');
        dlg().classList.toggle('wide', !isGroup);

        if (isGroup) {
            head.textContent = it ? `Edit ${groupWord.toLowerCase()}` : `New ${groupWord.toLowerCase()}`;
            document.getElementById('dlgBody').innerHTML = `
                <div class="field"><label for="fTitle">${groupWord} name</label><input class="input" id="fTitle" name="title" required maxlength="100" value="${esc(it ? it.title : '')}"></div>
                <p class="muted small">${F.wbs ? 'Deliverables group work packages in the work breakdown structure.' : 'Epics group related backlog items.'}</p>`;
        } else {
            const v = it || { title: '', description: '', type: 'task', status: defaults.status || 'backlog', parentId: defaults.parentId || null, assigneeId: null, estimate: '', moscow: F.moscow ? 'S' : null, deps: [], iterationId: defaults.iterationId || null, startDate: '', dueDate: '' };
            const parent = v.parentId ? A.item(v.parentId) : null;
            const isSub = !!(parent && parent.kind !== 'group');
            const subs = it && !isSub ? A.subtasksOf(it.id) : [];
            const subsDone = subs.filter(x => x.status === 'done').length;
            const deps = (v.deps || []).map(A.item).filter(Boolean);
            const blocks = it ? A.work().filter(x => (x.deps || []).includes(it.id)) : [];
            const linkedMs = it ? P.milestones.filter(m => m.itemIds.includes(it.id)).map(m => m.id) : (defaults.milestoneId ? [defaults.milestoneId] : []);
            const descendants = new Set();
            if (it) { const walk = pid => A.subtasksOf(pid).forEach(c => { descendants.add(c.id); walk(c.id); }); walk(it.id); }
            const parentItems = A.topItems().filter(x => !it || (x.id !== it.id && !descendants.has(x.id)));
            const iterOptions = P.iterations.filter(i => i.status !== 'closed');

            // Breadcrumb like Jira: Parent / KEY-12
            head.innerHTML = `${parent ? `<span class="crumb">${isSub ? `<span class="key">${A.keyOf(parent)}</span>` : `📁 ${esc(parent.title)}`}</span><span class="muted"> / </span>` : ''}<span class="key">${it ? A.keyOf(it) : 'New'}</span>${isSub ? ' <span class="pill">Subtask</span>' : ''}`;

            const row = (label, forId, control) => `<div class="ed-row"><label for="${forId}">${label}</label>${control}</div>`;
            document.getElementById('dlgBody').innerHTML = `<div class="ed">
                <div class="ed-main">
                    <label class="sr-only" for="fTitle">Title</label>
                    <textarea class="ed-title" id="fTitle" name="title" required maxlength="140" rows="1" placeholder="${isSub ? 'What needs to be done?' : F.hierarchy ? 'Name the deliverable, e.g. Login page' : 'e.g. As a teacher, I can mark attendance'}">${esc(v.title)}</textarea>
                    <label class="ed-label" for="fDesc">Description</label>
                    <textarea class="textarea ed-desc" id="fDesc" name="description" maxlength="2000" placeholder="Add details, acceptance criteria, links…">${esc(v.description)}</textarea>

                    ${it && !isSub ? `<section class="ed-sec" aria-labelledby="subH">
                        <div class="ed-sec-head"><h3 id="subH">Subtasks</h3>${subs.length ? `<span class="muted small">${subsDone} of ${subs.length} done</span>` : ''}</div>
                        ${subs.length ? `<div class="bar" style="margin-bottom: 0.5rem;"><div style="width:${subsDone / subs.length * 100}%; background: var(--ok)"></div></div>` : ''}
                        <ul class="ed-subs" id="edSubs">${subs.map(st => `<li>
                            <button type="button" class="jt-tick ${st.status === 'done' ? 'on' : ''}" data-subtick="${st.id}" aria-pressed="${st.status === 'done'}" aria-label="${st.status === 'done' ? 'Mark not done' : 'Mark done'}: ${A.keyOf(st)}">✓</button>
                            <span class="key">${A.keyOf(st)}</span><span class="ed-sub-t ${st.status === 'done' ? 'done' : ''}">${esc(st.title)}</span>
                            ${PMT.ui.avatar(A.member(st.assigneeId), 22)}<span class="pill ${st.status}">${STATUS[st.status]}</span></li>`).join('')}</ul>
                        <input class="input ed-addsub" id="subNew" maxlength="140" placeholder="＋ Add a subtask and press Enter" aria-label="New subtask title" autocomplete="off">
                    </section>` : ''}

                    ${F.schedule ? `<section class="ed-sec" aria-labelledby="depH">
                        <div class="ed-sec-head"><h3 id="depH">Dependencies</h3></div>
                        <div class="ed-sub">Waits for <span class="muted">(these finish first)</span></div>
                        <div class="dchips" id="depChips">${deps.map(o => depChip(o)).join('')}</div>
                        <div class="combo">
                            <input class="input" id="depSearch" role="combobox" aria-expanded="false" aria-controls="depList" aria-autocomplete="list" autocomplete="off" placeholder="＋ Add an item this waits for…">
                            <ul class="combo-list" id="depList" role="listbox" hidden></ul>
                        </div>
                        ${blocks.length ? `<div class="ed-sub" style="margin-top: 0.8rem;">Blocks <span class="muted">(these wait for this item)</span></div><div class="dchips">${blocks.map(o => depChip(o, false)).join('')}</div>` : ''}
                    </section>` : ''}

                    ${F.milestones && P.milestones.length ? `<section class="ed-sec" aria-labelledby="msH">
                        <div class="ed-sec-head"><h3 id="msH">Milestones</h3><span class="muted small">Click to link or unlink</span></div>
                        <div class="tchips">${P.milestones.map(m => `<label class="tchip"><input type="checkbox" name="ms" value="${m.id}" ${linkedMs.includes(m.id) ? 'checked' : ''}><span>◆ ${esc(m.name)}${m.targetDate ? ` <small>${D.fmt(m.targetDate)}</small>` : ''}</span></label>`).join('')}</div>
                    </section>` : ''}
                </div>

                <aside class="ed-side" aria-label="Details">
                    <label class="sr-only" for="fStatus">Status</label>
                    <select class="ed-status jt-status s-${v.status}" id="fStatus" name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <div class="ed-fields">
                        ${row('Assignee', 'fAssignee', `<select class="select" id="fAssignee" name="assigneeId"><option value="">Unassigned</option>${P.members.map(m => `<option value="${m.id}" ${v.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`)}
                        ${row('Type', 'fType', `<select class="select" id="fType" name="type">${TYPES.map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
                        ${row('Parent', 'fParent', `<select class="select" id="fParent" name="parentId"><option value="">None</option>
                            ${A.groups().length ? `<optgroup label="${esc(groupWord)}">${A.groups().map(g => `<option value="${g.id}" ${v.parentId === g.id ? 'selected' : ''}>${F.wbs ? A.code(g) + ' ' : ''}${esc(g.title)}</option>`).join('')}</optgroup>` : ''}
                            ${parentItems.length ? `<optgroup label="Subtask of">${parentItems.map(x => `<option value="${x.id}" ${v.parentId === x.id ? 'selected' : ''}>${A.keyOf(x)} ${esc(x.title)}</option>`).join('')}</optgroup>` : ''}</select>`)}
                        ${row('Start date', 'fStart', `<input class="input" type="date" id="fStart" name="startDate" value="${v.startDate || ''}">`)}
                        ${row('Due date', 'fDue', `<input class="input" type="date" id="fDue" name="dueDate" value="${v.dueDate || ''}">`)}
                        ${F.points ? row('Estimate', 'fEst', `<input class="input" type="number" min="0" max="100" step="1" id="fEst" name="estimate" value="${v.estimate ?? ''}" placeholder="Points">`) : ''}
                        ${F.moscow ? row('Priority', 'fMos', `<select class="select" id="fMos" name="moscow">${Object.entries(MOSCOW).map(([k, l]) => `<option value="${k}" ${v.moscow === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) : ''}
                        ${F.iterations && !isSub ? row(F.iterName, 'fIter', `<select class="select" id="fIter" name="iterationId"><option value="">Not planned</option>${iterOptions.map(i => `<option value="${i.id}" ${v.iterationId === i.id ? 'selected' : ''}>${esc(i.name)}${i.status === 'active' ? ' (active)' : ''}</option>`).join('')}</select>`) : ''}
                    </div>
                    ${it ? `<p class="ed-meta">Created ${it.createdAt ? new Date(it.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}${it.doneAt ? ` · Done ${new Date(it.doneAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}</p>` : ''}
                </aside>
            </div>`;
            wireEditor(it);
        }
        document.getElementById('dlgDelete').hidden = !it;
        dlg().dataset.id = id || '';
        dlg().dataset.kind = isGroup ? 'group' : 'item';
        if (!dlg().open) dlg().showModal();
        document.getElementById('fTitle').focus();
    };

    function wireEditor(it) {
        const title = document.getElementById('fTitle');
        const grow = () => { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; };
        title.addEventListener('input', grow);
        title.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });   // titles are one paragraph
        requestAnimationFrame(grow);
        const status = document.getElementById('fStatus');
        status.addEventListener('change', () => { status.className = `ed-status jt-status s-${status.value}`; });

        // Subtasks: tick and add without leaving the editor
        const subNew = document.getElementById('subNew');
        if (subNew) {
            subNew.addEventListener('keydown', e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const t = subNew.value.trim();
                if (!t) return;
                const st = A.newItem({ title: t, parentId: it.id, status: 'todo', order: A.subtasksOf(it.id).length, iterationId: it.iterationId || null, assigneeId: it.assigneeId || null });
                A.P.items.push(st);
                A.commit(`Created ${A.keyOf(st)} "${t}"`);
                refreshSubtasks(it);
                document.getElementById('subNew').focus();
            });
            document.getElementById('edSubs').addEventListener('click', e => {
                const b = e.target.closest('[data-subtick]');
                if (!b) return;
                const st = A.item(b.dataset.subtick);
                if (A.setStatus(st, st.status === 'done' ? 'todo' : 'done')) { A.commit(); refreshSubtasks(it); document.querySelector(`[data-subtick="${st.id}"]`)?.focus(); }
            });
        }

        // Dependency picker: search, arrow keys, Enter to add; loops are left out
        const input = document.getElementById('depSearch');
        if (!input) return;
        const list = document.getElementById('depList'), chips = document.getElementById('depChips');
        let active = 0, options = [];
        const selected = () => [...chips.querySelectorAll('input[name="dep"]')].map(i => i.value);
        const eligible = () => A.work().filter(o => (!it || (o.id !== it.id && !PMT.schedule.wouldCycle(A.P.items, it.id, o.id))) && !selected().includes(o.id));
        const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
        const draw = () => {
            const q = input.value.trim().toLowerCase();
            options = eligible().filter(o => !q || `${A.keyOf(o)} ${o.title}`.toLowerCase().includes(q)).slice(0, 8);
            active = Math.max(0, Math.min(active, options.length - 1));
            list.innerHTML = options.map((o, k) => `<li role="option" id="depopt-${k}" aria-selected="${k === active}" data-k="${k}"><span class="key">${A.keyOf(o)}</span> ${esc(o.title)} <span class="pill ${o.status}">${STATUS[o.status]}</span></li>`).join('') || '<li class="combo-empty">No matching items</li>';
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            if (options.length) input.setAttribute('aria-activedescendant', `depopt-${active}`);
        };
        const add = o => { chips.insertAdjacentHTML('beforeend', depChip(o)); input.value = ''; active = 0; draw(); };
        input.addEventListener('focus', draw);
        input.addEventListener('input', () => { active = 0; draw(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, options.length - 1); draw(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) add(options[active]); }
        });
        input.addEventListener('blur', () => setTimeout(close, 120));
        list.addEventListener('mousedown', e => { const li = e.target.closest('[data-k]'); if (li) { e.preventDefault(); add(options[Number(li.dataset.k)]); } });
        chips.addEventListener('click', e => { const x = e.target.closest('.dchip-x'); if (x) { x.closest('.dchip').remove(); input.focus(); } });
    }

    function refreshSubtasks(it) {
        const subs = A.subtasksOf(it.id), done = subs.filter(x => x.status === 'done').length;
        const sec = document.getElementById('edSubs').closest('.ed-sec');
        sec.querySelector('.ed-sec-head').innerHTML = `<h3 id="subH">Subtasks</h3><span class="muted small">${done} of ${subs.length} done</span>`;
        let bar = sec.querySelector('.bar');
        if (!bar) { sec.querySelector('.ed-sec-head').insertAdjacentHTML('afterend', '<div class="bar" style="margin-bottom: 0.5rem;"><div style="background: var(--ok)"></div></div>'); bar = sec.querySelector('.bar'); }
        bar.firstElementChild.style.width = `${subs.length ? done / subs.length * 100 : 0}%`;
        document.getElementById('edSubs').innerHTML = subs.map(st => `<li>
            <button type="button" class="jt-tick ${st.status === 'done' ? 'on' : ''}" data-subtick="${st.id}" aria-pressed="${st.status === 'done'}" aria-label="${st.status === 'done' ? 'Mark not done' : 'Mark done'}: ${A.keyOf(st)}">✓</button>
            <span class="key">${A.keyOf(st)}</span><span class="ed-sub-t ${st.status === 'done' ? 'done' : ''}">${esc(st.title)}</span>
            ${PMT.ui.avatar(A.member(st.assigneeId), 22)}<span class="pill ${st.status}">${STATUS[st.status]}</span></li>`).join('');
        document.getElementById('subNew').value = '';
    }

    function saveDialog(e) {
        e.preventDefault();
        const form = document.getElementById('dlgForm');
        const fd = new FormData(form);
        const title = String(fd.get('title') || '').trim();
        if (!title) { document.getElementById('fTitle').focus(); return; }
        const id = dlg().dataset.id, kind = dlg().dataset.kind;
        const P = A.P, F = A.F, now = new Date().toISOString();

        if (kind === 'group') {
            if (id) { A.item(id).title = title; A.log(`Renamed ${A.groupWord().toLowerCase()} to "${title}"`); }
            else {
                P.items.push({ id: PMT.uid('g_'), kind: 'group', title, order: A.groups().length, raci: {} });
                A.log(`Added ${A.groupWord().toLowerCase()} "${title}"`);
            }
            dlg().close();
            A.commit(null, id ? 'Saved' : `Added "${title}"`, 'good');
            return;
        }

        let it = id ? A.item(id) : null;
        const isNew = !it;
        if (isNew) {
            it = A.newItem();
            P.items.push(it);
        }
        const parentId = fd.get('parentId') || null;
        if (isNew || it.parentId !== parentId) it.order = parentId ? A.work().filter(x => x.parentId === parentId && x.id !== it.id).length : 0;
        // Dates: keep start ≤ due; the duration follows the dates
        let startDate = fd.get('startDate') || null, dueDate = fd.get('dueDate') || null;
        if (startDate && dueDate && dueDate < startDate) [startDate, dueDate] = [dueDate, startDate];
        if (startDate && !dueDate) dueDate = D.addWorkdays(startDate, Math.max(1, Number(it.duration) || 1) - 1);
        if (dueDate && !startDate) startDate = dueDate;
        it.startDate = startDate;
        it.dueDate = dueDate;
        if (startDate && dueDate) it.duration = D.spanDays(startDate, dueDate);
        Object.assign(it, {
            title, description: String(fd.get('description') || ''), type: fd.get('type') || 'task',
            assigneeId: fd.get('assigneeId') || null, parentId
        });
        if (F.points) it.estimate = fd.get('estimate') === '' ? null : Number(fd.get('estimate'));
        if (F.schedule) it.deps = fd.getAll('dep').filter(d => !PMT.schedule.wouldCycle(P.items, it.id, d));
        if (F.moscow) it.moscow = fd.get('moscow');
        if (F.iterations) {
            // Subtasks travel with their parent's sprint
            const parent = A.item(parentId);
            it.iterationId = parent && parent.kind !== 'group' ? (parent.iterationId || null) : (fd.get('iterationId') || null);
            A.syncSubtasks(it);
        }
        if (F.milestones) {
            const chosen = fd.getAll('ms');
            P.milestones.forEach(m => {
                const has = m.itemIds.includes(it.id);
                if (chosen.includes(m.id) && !has) m.itemIds.push(it.id);
                if (!chosen.includes(m.id) && has) m.itemIds = m.itemIds.filter(x => x !== it.id);
            });
        }
        const status = fd.get('status');
        if (status && status !== it.status && !A.setStatus(it, status)) { /* WIP limit: keep old status */ }
        A.log(isNew ? `Added "${title}"` : `Updated "${title}"`);
        dlg().close();
        A.commit(null, isNew ? `Added "${title}"` : 'Saved', 'good');
    }

    function deleteFromDialog() {
        const id = dlg().dataset.id;
        const it = A.item(id);
        if (!it) return;
        const P = A.P;
        if (it.kind === 'group') {
            const kids = A.childrenOf(id);
            if (!confirm(`Delete "${it.title}"? Its ${kids.length} item(s) will be kept but ungrouped.`)) return;
            kids.forEach(k => { k.parentId = null; });
        } else {
            const subs = [];
            const walk = pid => A.subtasksOf(pid).forEach(c => { subs.push(c.id); walk(c.id); });
            walk(id);
            if (!confirm(`Delete ${A.keyOf(it)} "${it.title}"${subs.length ? ` and its ${subs.length} subtask${subs.length > 1 ? 's' : ''}` : ''}? This can't be undone.`)) return;
            P.items = P.items.filter(x => !subs.includes(x.id));
            P.items.forEach(x => { if (x.deps) x.deps = x.deps.filter(d => !subs.includes(d)); });
            P.milestones.forEach(m => { m.itemIds = m.itemIds.filter(x => !subs.includes(x)); });
        }
        P.items = P.items.filter(x => x.id !== id);
        P.items.forEach(x => { if (x.deps) x.deps = x.deps.filter(d => d !== id); });
        P.milestones.forEach(m => { m.itemIds = m.itemIds.filter(x => x !== id); });
        A.log(`Deleted "${it.title}"`);
        dlg().close();
        A.commit(null, `Deleted "${it.title}"`);
    }

    // Common actions used by several views
    A.action('openItem', el => A.openItem(el.dataset.id));
    A.action('newItem', el => A.openItem(null, { ...el.dataset }));
    A.action('newGroup', () => A.openItem(null, { kind: 'group' }));

    // ─── Boot ───
    async function boot() {
        const id = new URLSearchParams(location.search).get('id');
        const P = id ? await PMT.store.get(id) : null;
        if (!P) {
            document.body.innerHTML = `<main class="page"><div class="card empty"><div class="big">🔍</div><h2>Project not found</h2>
                <p>It may have been deleted, or it was created in another browser.</p><p style="margin-top: 1rem;"><a class="btn btn-primary" href="index.html">Go to your projects</a></p></div></main>`;
            return;
        }
        A.P = P;
        P.settings.tools = P.settings.tools || {};
        A.refreshFeatures();
        A.migrate();
        document.title = `${P.name} - PM Ready Project Tool`;
        document.getElementById('dlgForm').addEventListener('submit', saveDialog);
        document.getElementById('dlgCancel').addEventListener('click', () => dlg().close());
        document.getElementById('dlgClose').addEventListener('click', () => dlg().close());
        document.getElementById('dlgDelete').addEventListener('click', deleteFromDialog);
        dlg().addEventListener('cancel', e => {
            const list = document.getElementById('depList');
            if (list && !list.hidden) { e.preventDefault(); list.hidden = true; }
        });
        document.getElementById('addItemTop').addEventListener('click', () => A.openItem(null, A.view === 'board' && A.F.iterations && A.activeIteration() ? { iterationId: A.activeIteration().id, status: 'todo' } : {}));
        window.addEventListener('hashchange', route);
        // Another tab saved this project: reload it so both tabs show the same data
        window.addEventListener('storage', async e => {
            if (e.key !== PMT.STORE_KEY) return;
            const fresh = await PMT.store.get(A.P.id);
            if (!fresh) { toast('This project was deleted in another tab.', 'bad'); return; }
            if (fresh.updatedAt !== A.P.updatedAt) {
                A.P = fresh;
                fresh.settings.tools = fresh.settings.tools || {};
                A.refreshFeatures();
                render();
                toast('Updated with changes from another tab.');
            }
        });
        route();
        setSaved(false);
    }
    A.boot = boot;
})();
