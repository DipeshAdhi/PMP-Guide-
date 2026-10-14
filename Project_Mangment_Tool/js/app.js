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
    A.activeIteration = () => A.P.iterations.find(i => i.status === 'active') || null;
    A.plannedIteration = () => A.P.iterations.find(i => i.status === 'planned') || null;
    A.code = item => {
        if (!A.F.hierarchy) return '';
        const gs = A.groups();
        if (item.kind === 'group') return String(gs.indexOf(item) + 1);
        const g = A.item(item.parentId);
        if (!g) return '';
        return `${gs.indexOf(g) + 1}.${A.childrenOf(g.id).indexOf(item) + 1}`;
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
        const attrs = ['data-act', 'data-change', 'data-id', 'data-dir', 'data-col', 'data-m', 'data-v', 'data-to'];
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
    const ICONS = { overview: '🏠', work: '📋', board: '🗂️', iterations: '🔁', schedule: '📊', milestones: '🏁', team: '👥', changes: '📝', risks: '⚠️', settings: '⚙️' };
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

    // ─── Work-item editor ───
    const dlg = () => document.getElementById('itemDialog');
    A.openItem = (id, defaults = {}) => {
        const F = A.F, P = A.P;
        const it = id ? A.item(id) : null;
        const isGroup = it ? it.kind === 'group' : defaults.kind === 'group';
        const groupWord = F.hierarchy ? 'Deliverable (WBS)' : 'Epic';
        const v = it || { title: '', description: '', type: 'task', status: defaults.status || 'backlog', parentId: defaults.parentId || null, assigneeId: null, estimate: '', duration: F.schedule ? 3 : '', moscow: F.moscow ? 'S' : null, deps: [], iterationId: defaults.iterationId || null };
        const others = A.work().filter(x => !it || x.id !== it.id);
        const iterOptions = P.iterations.filter(i => i.status !== 'closed');
        const linkedMs = it ? P.milestones.filter(m => m.itemIds.includes(it.id)).map(m => m.id) : (defaults.milestoneId ? [defaults.milestoneId] : []);

        document.getElementById('dlgTitle').textContent = isGroup ? (it ? `Edit ${groupWord.toLowerCase()}` : `New ${groupWord.toLowerCase()}`) : (it ? `Edit ${F.hierarchy && A.code(it) ? A.code(it) + ' · ' : ''}work item` : 'New work item');
        document.getElementById('dlgBody').innerHTML = isGroup ? `
            <div class="field"><label for="fTitle">${groupWord} name</label><input class="input" id="fTitle" name="title" required maxlength="100" value="${esc(v.title)}"></div>
            <p class="muted small">${F.hierarchy ? 'Deliverables group work packages in the work breakdown structure.' : 'Epics group related backlog items.'}</p>` : `
            <div class="field"><label for="fTitle">Title</label><input class="input" id="fTitle" name="title" required maxlength="140" value="${esc(v.title)}" placeholder="${F.hierarchy ? 'Name the deliverable, e.g. Login page' : 'e.g. As a teacher, I can mark attendance'}"></div>
            <div class="field"><label for="fDesc">Description / acceptance criteria</label><textarea class="textarea" id="fDesc" name="description" maxlength="2000">${esc(v.description)}</textarea></div>
            <div class="row">
                <div class="field"><label for="fStatus">Status</label><select class="select" id="fStatus" name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                <div class="field"><label for="fAssignee">Assigned to</label><select class="select" id="fAssignee" name="assigneeId"><option value="">Unassigned</option>${P.members.map(m => `<option value="${m.id}" ${v.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)} · ${esc(m.role)}</option>`).join('')}</select></div>
                <div class="field"><label for="fType">Type</label><select class="select" id="fType" name="type">${[['task', 'Task'], ['story', 'User story'], ['bug', 'Bug']].map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            </div>
            <div class="row">
                <div class="field"><label for="fParent">${groupWord}</label><select class="select" id="fParent" name="parentId"><option value="">None</option>${A.groups().map(g => `<option value="${g.id}" ${v.parentId === g.id ? 'selected' : ''}>${F.hierarchy ? A.code(g) + ' ' : ''}${esc(g.title)}</option>`).join('')}</select></div>
                ${F.points ? `<div class="field"><label for="fEst">Estimate (points)</label><input class="input" type="number" min="0" max="100" step="1" id="fEst" name="estimate" value="${v.estimate ?? ''}"></div>` : ''}
                ${F.schedule ? `<div class="field"><label for="fDur">Duration (working days)</label><input class="input" type="number" min="0" max="365" step="1" id="fDur" name="duration" value="${v.duration ?? ''}"></div>` : ''}
                ${F.moscow ? `<div class="field"><label for="fMos">Priority</label><select class="select" id="fMos" name="moscow">${Object.entries(MOSCOW).map(([k, l]) => `<option value="${k}" ${v.moscow === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
                ${F.iterations ? `<div class="field"><label for="fIter">${F.iterName}</label><select class="select" id="fIter" name="iterationId"><option value="">Not planned</option>${iterOptions.map(i => `<option value="${i.id}" ${v.iterationId === i.id ? 'selected' : ''}>${esc(i.name)}${i.status === 'active' ? ' (active)' : ''}</option>`).join('')}</select></div>` : ''}
            </div>
            ${F.schedule ? `<div class="field"><span class="label">Depends on (must finish first)</span><div class="check-list">${others.length ? others.map(o => {
                const blocked = it && PMT.schedule.wouldCycle(A.P.items, it.id, o.id);
                return `<label><input type="checkbox" name="dep" value="${o.id}" ${(v.deps || []).includes(o.id) ? 'checked' : ''} ${blocked ? 'disabled title="Would create a loop"' : ''}> ${A.code(o) ? `<span class="mono muted">${A.code(o)}</span>` : ''} ${esc(o.title)}${blocked ? ' <span class="muted small">(depends on this item)</span>' : ''}</label>`;
            }).join('') : '<span class="muted small">No other items yet.</span>'}</div></div>` : ''}
            ${F.milestones && P.milestones.length ? `<div class="field"><span class="label">Counts toward milestones</span><div class="check-list">${P.milestones.map(m => `<label><input type="checkbox" name="ms" value="${m.id}" ${linkedMs.includes(m.id) ? 'checked' : ''}> ◆ ${esc(m.name)}</label>`).join('')}</div></div>` : ''}`;
        document.getElementById('dlgDelete').hidden = !it;
        dlg().dataset.id = id || '';
        dlg().dataset.kind = isGroup ? 'group' : 'item';
        dlg().showModal();
        document.getElementById('fTitle').focus();
    };

    function saveDialog(e) {
        e.preventDefault();
        const form = document.getElementById('dlgForm');
        const fd = new FormData(form);
        const title = String(fd.get('title') || '').trim();
        if (!title) { document.getElementById('fTitle').focus(); return; }
        const id = dlg().dataset.id, kind = dlg().dataset.kind;
        const P = A.P, F = A.F, now = new Date().toISOString();

        if (kind === 'group') {
            if (id) { A.item(id).title = title; A.log(`Renamed ${F.hierarchy ? 'deliverable' : 'epic'} to "${title}"`); }
            else {
                P.items.push({ id: PMT.uid('g_'), kind: 'group', title, order: A.groups().length, raci: {} });
                A.log(`Added ${F.hierarchy ? 'deliverable' : 'epic'} "${title}"`);
            }
            dlg().close();
            A.commit(null, id ? 'Saved' : `Added "${title}"`, 'good');
            return;
        }

        let it = id ? A.item(id) : null;
        const isNew = !it;
        if (isNew) {
            it = { id: PMT.uid('i_'), kind: 'item', status: 'backlog', rank: A.nextRank(), order: 0, deps: [], createdAt: now };
            P.items.push(it);
        }
        const parentId = fd.get('parentId') || null;
        if (isNew || it.parentId !== parentId) it.order = parentId ? A.childrenOf(parentId).filter(x => x.id !== it.id).length : 0;
        Object.assign(it, {
            title, description: String(fd.get('description') || ''), type: fd.get('type') || 'task',
            assigneeId: fd.get('assigneeId') || null, parentId
        });
        if (F.points) it.estimate = fd.get('estimate') === '' ? null : Number(fd.get('estimate'));
        if (F.schedule) {
            it.duration = fd.get('duration') === '' ? null : Number(fd.get('duration'));
            it.deps = fd.getAll('dep').filter(d => !PMT.schedule.wouldCycle(P.items, it.id, d));
        }
        if (F.moscow) it.moscow = fd.get('moscow');
        if (F.iterations) it.iterationId = fd.get('iterationId') || null;
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
        } else if (!confirm(`Delete "${it.title}"? This can't be undone.`)) return;
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
        A.F = PMT.features(P.method);
        document.title = `${P.name} - PM Ready Project Tool`;
        document.getElementById('dlgForm').addEventListener('submit', saveDialog);
        document.getElementById('dlgCancel').addEventListener('click', () => dlg().close());
        document.getElementById('dlgClose').addEventListener('click', () => dlg().close());
        document.getElementById('dlgDelete').addEventListener('click', deleteFromDialog);
        document.getElementById('addItemTop').addEventListener('click', () => A.openItem(null, A.view === 'board' && A.F.iterations && A.activeIteration() ? { iterationId: A.activeIteration().id, status: 'todo' } : {}));
        window.addEventListener('hashchange', route);
        // Another tab saved this project: reload it so both tabs show the same data
        window.addEventListener('storage', async e => {
            if (e.key !== PMT.STORE_KEY) return;
            const fresh = await PMT.store.get(A.P.id);
            if (!fresh) { toast('This project was deleted in another tab.', 'bad'); return; }
            if (fresh.updatedAt !== A.P.updatedAt) {
                A.P = fresh;
                A.F = PMT.features(fresh.method);
                render();
                toast('Updated with changes from another tab.');
            }
        });
        route();
        setSaved(false);
    }
    A.boot = boot;
})();
