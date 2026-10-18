/* ===================================================================
   View: Gantt chart, Jira-style.
   Left: a simple issue list (key, summary, status, assignee, start, due, ✓).
   Right: bars on the calendar.
     • drag a bar to move it, drag its ends to change start/due
     • click an empty row to schedule an item that has no dates
     • drag the ● at a bar's end onto another bar to add a dependency
     • click an arrow to remove a dependency (red = broken)
   Subtasks nest under their parent; ＋ adds one, "Create" rows add items.
   =================================================================== */
(function () {
    const A = PMT.app;
    const { esc, toast, STATUS } = PMT.ui;
    const D = PMT.dates;
    const ROW = 40;
    const ZOOM = { days: 34, weeks: 18, months: 6 };
    const TYPE_ICON = { group: 't-epic', story: 't-story', bug: 't-bug', task: 't-task' };

    A.state.ganttZoom = A.state.ganttZoom || 'weeks';
    A.state.collapsed = A.state.collapsed || {};
    // Table columns: width is adjustable by dragging the header edge; remembered per browser
    const COLS = [
        { k: 'key', label: 'Key', min: 44, max: 160, def: 66 },
        { k: 'sum', label: 'Summary', min: 100, max: 900, def: 280 },
        { k: 'status', label: 'Status', min: 70, max: 200, def: 112, field: true },
        { k: 'who', label: 'Assignee', min: 56, max: 220, def: 100, field: true },
        { k: 'start', label: 'Start', min: 52, max: 160, def: 76, field: true },
        { k: 'due', label: 'Due', min: 52, max: 160, def: 76, field: true }
    ];
    const PREFS = 'pmt_gantt_prefs';
    const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } })();
    const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify({ cols: A.state.gCols, mode: A.state.gMode })); } catch (e) {} };
    A.state.gCols = Object.assign(Object.fromEntries(COLS.map(c => [c.k, c.def])), prefs.cols || {});
    // 'list' = table only (like Jira's list), 'both' = table + chart, 'chart' = key + summary + chart
    A.state.gMode = prefs.mode || (window.innerWidth < 900 ? 'list' : 'both');
    // Width of the table: fixed bits (expand, type, ＋, done, gaps, padding) + the columns
    function leftWidth(showFields) {
        const c = A.state.gCols;
        return (showFields ? 205 : 172) + c.key + c.sum + (showFields ? c.status + c.who + c.start + c.due : 0);
    }
    A.state.gSearch = '';
    A.state.addSubFor = null;
    A.state.gScroll = null;

    const mondayOf = iso => D.addDays(iso, -((D.toDate(iso).getUTCDay() + 6) % 7));
    let ctx = null; // geometry of the last render, used by drag handlers

    // ─── Rows: groups → items → subtasks, plus inline "create" rows ───
    function buildRows() {
        const rows = [];
        const q = A.state.gSearch.trim().toLowerCase();
        const who = A.state.who;
        const matches = i => (!q || `${A.keyOf(i)} ${i.title}`.toLowerCase().includes(q)) && (!who || (who === 'none' ? !i.assigneeId : i.assigneeId === who));
        const visible = i => matches(i) || A.subtasksOf(i.id).some(visible);
        const filtering = !!(q || who);
        const pushItem = (i, depth) => {
            if (!visible(i)) return;
            const kids = A.subtasksOf(i.id);
            const open = !A.state.collapsed[i.id] || filtering;
            rows.push({ kind: 'item', item: i, depth, kids: kids.length, open });
            if (open) kids.forEach(k => pushItem(k, depth + 1));
            if (A.state.addSubFor === i.id) rows.push({ kind: 'create', parentId: i.id, depth: depth + 1, label: `Add a subtask to ${A.keyOf(i)}` });
        };
        A.groups().forEach(g => {
            const kids = A.childrenOf(g.id);
            if (filtering && !kids.some(visible)) return;
            const open = !A.state.collapsed[g.id] || filtering;
            rows.push({ kind: 'group', item: g, depth: 0, kids: kids.length, open });
            if (open) {
                kids.forEach(k => pushItem(k, 1));
                if (!filtering) rows.push({ kind: 'create', parentId: g.id, depth: 1, label: `Create in ${g.title}` });
            }
        });
        const loose = A.ranked().filter(i => !i.parentId || !A.item(i.parentId));
        if (A.groups().length && loose.some(visible)) rows.push({ kind: 'label', text: `Not in a ${A.groupWord().toLowerCase()}` });
        loose.forEach(i => pushItem(i, 0));
        if (!filtering) rows.push({ kind: 'create', parentId: null, depth: 0, label: 'Create work item' });
        return rows;
    }

    // Every work item under a group or item (for roll-ups)
    function descendants(id) {
        const out = [];
        const walk = pid => A.work().filter(i => i.parentId === pid).forEach(c => { out.push(c); walk(c.id); });
        walk(id);
        return out;
    }

    A.register('schedule', {
        render() {
            const P = A.P, F = A.F;
            const s = PMT.schedule.buildSchedule(P);
            const today = D.todayISO();
            const dayW = ZOOM[A.state.ganttZoom];
            const rows = buildRows();

            // Calendar range around everything that has a date
            const dates = [P.startDate, today, ...Object.values(s.byId).flatMap(t => [t.startDate, t.endDate]), ...P.milestones.map(m => m.targetDate).filter(Boolean)].sort();
            const start = mondayOf(D.addDays(dates[0], -7));
            let end = D.addDays(dates[dates.length - 1], 28);
            const minDays = A.state.ganttZoom === 'months' ? 200 : 70;
            if (D.daysBetween(start, end) < minDays) end = D.addDays(start, minDays);
            const total = D.daysBetween(start, end) + 1;
            const trackW = total * dayW;
            const x = iso => D.daysBetween(start, iso) * dayW;
            const mode = A.state.gMode, showFields = mode !== 'chart';
            const leftW = leftWidth(showFields);
            ctx = { start, dayW, rows, leftW };

            // Header: months on top, days/weeks below
            let months = '', days = '', weekends = '';
            for (let k = 0; k < total; k++) {
                const iso = D.addDays(start, k), d = D.toDate(iso), dow = d.getUTCDay();
                if (d.getUTCDate() === 1 || k === 0) months += `<span class="jt-month" style="left:${k * dayW}px">${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>`;
                if (A.state.ganttZoom === 'days') days += `<span class="jt-day ${iso === today ? 'is-today' : ''}" style="left:${k * dayW}px; width:${dayW}px">${d.getUTCDate()}</span>`;
                else if (A.state.ganttZoom === 'weeks' && dow === 1) days += `<span class="jt-day wk ${iso <= today && D.addDays(iso, 6) >= today ? 'is-today' : ''}" style="left:${k * dayW}px">${d.getUTCDate()}</span>`;
                if (A.state.ganttZoom !== 'months' && (dow === 0 || dow === 6)) weekends += `<span style="left:${k * dayW}px; width:${dayW}px"></span>`;
            }

            const statusSelect = i => `<select class="jt-status s-${i.status}" data-change="jtStatus" data-id="${i.id}" aria-label="Status of ${A.keyOf(i)}">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
            const whoSelect = i => `<select class="jt-who" data-change="jtWho" data-id="${i.id}" aria-label="Assignee of ${A.keyOf(i)}"><option value="">Unassigned</option>${P.members.map(m => `<option value="${m.id}" ${i.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
            // Compact date: shows "14 Oct", click opens the date picker (hidden native input)
            const dateInput = (i, field, t) => {
                const val = i[field] || (t ? (field === 'startDate' ? t.startDate : t.endDate) : '');
                const label = `${field === 'startDate' ? 'Start' : 'Due'} date of ${A.keyOf(i)}`;
                const wide = A.state.gCols[field === 'startDate' ? 'start' : 'due'] >= 96;   // wider column → show the year too
                const shown = val ? D.fmt(val, wide ? { day: 'numeric', month: 'short', year: 'numeric' } : undefined) : '—';
                return `<span class="jt-date jt-${field === 'startDate' ? 'start' : 'due'}"><button type="button" class="jt-dbtn ${val ? '' : 'empty'}" data-act="jtPickDate" aria-label="${label}: ${val ? D.fmt(val, { day: 'numeric', month: 'long', year: 'numeric' }) : 'not set'}" title="${val ? D.fmt(val, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Set a date'}">${shown}</button>
                    <input type="date" tabindex="-1" aria-hidden="true" data-change="jtDate" data-id="${i.id}" data-field="${field}" value="${val}"></span>`;
            };

            let body = '';
            const paths = [];
            const rowIndex = {};
            rows.forEach((r, idx) => { if (r.item) rowIndex[r.item.id] = idx; });

            rows.forEach((r, idx) => {
                const indent = `<span style="width:${r.depth * 18}px; flex: none;"></span>`;
                const chev = r.kids ? `<button class="jt-chev" data-act="jtToggle" data-id="${r.item.id}" aria-expanded="${r.open}" aria-label="${r.open ? 'Collapse' : 'Expand'} ${esc(r.item.title)}">${r.open ? '▾' : '▸'}</button>` : '<span class="jt-chev"></span>';

                if (r.kind === 'label') {
                    body += `<div class="jt-row jt-label-row"><div class="jt-left"><span class="muted small" style="padding-left: 0.6rem;">${esc(r.text)}</span></div><div class="jt-track" style="width:${trackW}px"></div></div>`;
                    return;
                }
                if (r.kind === 'create') {
                    body += `<div class="jt-row jt-create-row"><div class="jt-left"><form class="jt-create" data-form="jtCreate" data-parent="${r.parentId || ''}">${indent}<span class="jt-chev"></span>
                        <input name="title" maxlength="140" placeholder="＋ ${esc(r.label)}" aria-label="${esc(r.label)}" autocomplete="off"></form></div><div class="jt-track" style="width:${trackW}px"></div></div>`;
                    return;
                }
                const i = r.item;
                if (r.kind === 'group') {
                    const all = descendants(i.id);
                    const done = all.filter(x => x.status === 'done').length;
                    const spans = all.map(x => s.byId[x.id]).filter(Boolean);
                    const gs = spans.length ? spans.map(t => t.startDate).sort()[0] : null;
                    const ge = spans.length ? spans.map(t => t.endDate).sort().pop() : null;
                    body += `<div class="jt-row jt-group" data-row-id="${i.id}">
                        <div class="jt-left">${chev}<span class="jt-type t-epic" aria-hidden="true"></span>
                            <button class="jt-sum strong" data-act="openItem" data-id="${i.id}">${A.code(i) ? `<span class="mono muted">${A.code(i)}</span> ` : ''}${esc(i.title)}</button>
                            ${showFields ? `<span class="jt-roll">${gs ? `${D.fmt(gs)} – ${D.fmt(ge)}` : 'No dates'}</span>` : ''}
                            <span class="jt-progress" title="${done} of ${all.length} done"><span class="jt-pbar"><span style="width:${all.length ? done / all.length * 100 : 0}%"></span></span>${done}/${all.length}</span>
                        </div>
                        <div class="jt-track" style="width:${trackW}px">${gs ? `<span class="jt-rollup" style="left:${x(gs)}px; width:${(D.daysBetween(gs, ge) + 1) * dayW - 2}px"><span style="width:${all.length ? done / all.length * 100 : 0}%"></span></span>` : ''}</div>
                    </div>`;
                    return;
                }

                const t = s.byId[i.id];
                const subs = A.subtasksOf(i.id);
                const subsDone = subs.filter(x => x.status === 'done').length;
                const crit = A.state.showCritical && t && t.critical && i.status !== 'done';
                const tick = `<button class="jt-tick ${i.status === 'done' ? 'on' : ''}" data-act="jtTick" data-id="${i.id}" aria-pressed="${i.status === 'done'}" aria-label="${i.status === 'done' ? 'Mark not done' : 'Mark done'}: ${A.keyOf(i)}">✓</button>`;
                body += `<div class="jt-row ${i.status === 'done' ? 'is-done' : ''}" data-row-id="${i.id}">
                    <div class="jt-left">${indent}${chev}<span class="jt-type ${A.isSubtask(i) ? 't-sub' : TYPE_ICON[i.type] || 't-task'}" title="${A.isSubtask(i) ? 'Subtask' : i.type}" aria-hidden="true"></span>
                        <button class="jt-key" data-act="openItem" data-id="${i.id}">${A.keyOf(i)}</button>
                        <button class="jt-sum" data-act="openItem" data-id="${i.id}" title="${esc(i.title)}">${esc(i.title)}</button>
                        ${!A.isSubtask(i) ? `<button class="jt-add" data-act="jtAddSub" data-id="${i.id}" aria-label="Add subtask to ${A.keyOf(i)}" title="Add subtask">＋</button>` : '<span class="jt-add-sp"></span>'}
                        ${showFields ? statusSelect(i) + whoSelect(i) + dateInput(i, 'startDate', t) + dateInput(i, 'dueDate', t) : ''}
                        <span class="jt-done">${subs.length ? `<span class="small muted" title="${subsDone} of ${subs.length} subtasks done">${subsDone}/${subs.length}</span>` : ''}${tick}</span>
                    </div>
                    <div class="jt-track" style="width:${trackW}px" ${t ? '' : 'data-empty="1" title="Click to schedule"'}>
                        ${t ? `<div class="jt-bar s-${i.status} ${crit ? 'crit' : ''}" data-bar="${i.id}" data-drag="move" style="left:${x(t.startDate)}px; width:${Math.max(dayW - 2, (D.daysBetween(t.startDate, t.endDate) + 1) * dayW - 2)}px"
                                title="${A.keyOf(i)} ${esc(i.title)}: ${D.fmt(t.startDate)} – ${D.fmt(t.endDate)}${t.fixed ? '' : ' (auto)'}">
                                <span class="jt-h l" data-drag="start" title="Drag to change the start date"></span>
                                <span class="jt-bl">${i.status === 'done' ? '✓ ' : ''}${A.keyOf(i)}${subs.length ? ` · ${subsDone}/${subs.length}` : ''}</span>
                                <span class="jt-h r" data-drag="end" title="Drag to change the due date"></span>
                                <span class="jt-link" data-link="${i.id}" title="Drag onto another bar: that item waits for this one"></span>
                            </div>` : '<span class="jt-ghost">Click to schedule</span>'}
                    </div>
                </div>`;

                // Dependency arrows into this item
                if (t) (i.deps || []).forEach(dep => {
                    const pt = s.byId[dep];
                    if (!pt || rowIndex[dep] == null) return;
                    const x1 = x(pt.endDate) + dayW - 2, y1 = rowIndex[dep] * ROW + ROW / 2;
                    const x2 = x(t.startDate), y2 = idx * ROW + ROW / 2;
                    const bad = s.conflicts.some(c => c.from === dep && c.to === i.id);
                    const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8));
                    const d = `M${x1} ${y1} H${mid} V${y2} H${x2}`;
                    paths.push(`<g class="jt-dep ${bad ? 'bad' : ''}"><path d="${d}" marker-end="url(#${bad ? 'jtArrBad' : 'jtArr'})"/>
                        <path class="hit" d="${d}" data-act="jtUnlink" data-from="${dep}" data-to="${i.id}"><title>${A.keyOf(A.item(dep))} → ${A.keyOf(i)}${bad ? ' (broken: starts before the other finishes)' : ''}. Click to remove.</title></path></g>`);
                });
            });

            const msRow = F.milestones && P.milestones.some(m => m.targetDate)
                ? `<div class="jt-row jt-ms-row"><div class="jt-left"><span class="jt-chev"></span><strong class="small">🏁 Milestones</strong></div><div class="jt-track" style="width:${trackW}px">${P.milestones.filter(m => m.targetDate).map(m => {
                    const items = m.itemIds.map(A.item).filter(Boolean);
                    const reached = items.length && items.every(i => i.status === 'done');
                    const f = PMT.schedule.milestoneForecast(P, m, s);
                    const late = !reached && f && f > m.targetDate;
                    return `<span class="tl-ms ${reached ? 'reached' : late ? 'late' : ''}" style="left:${x(m.targetDate) + dayW / 2}px" title="${esc(m.name)}: target ${D.fmt(m.targetDate)}${f ? `, forecast ${D.fmt(f)}` : ''}"><i></i><b>${esc(m.name)}</b></span>`;
                }).join('')}</div></div>` : '';

            const conflicts = s.conflicts.length;
            const scheduled = Object.keys(s.byId).length;
            return {
                sub: scheduled ? `${D.fmt(s.start, { day: 'numeric', month: 'short' })} → ${D.fmt(s.finishDate, { day: 'numeric', month: 'short', year: 'numeric' })} · ${scheduled} scheduled item${scheduled === 1 ? '' : 's'}` : 'Set dates on your work to see it on the chart',
                html: `<div class="view-head jt-toolbar">
                        <div class="toolbar">
                            <input class="input" type="search" id="gSearch" placeholder="Search" value="${esc(A.state.gSearch)}" aria-label="Search work items">
                            <select class="select" data-change="filterWho" aria-label="Filter by person"><option value="">Everyone</option><option value="none" ${A.state.who === 'none' ? 'selected' : ''}>Unassigned</option>${P.members.map(m => `<option value="${m.id}" ${A.state.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
                            <div class="seg small" role="radiogroup" aria-label="Zoom">${['days', 'weeks', 'months'].map(z => `<button role="radio" aria-checked="${A.state.ganttZoom === z}" data-act="jtZoom" data-v="${z}">${z[0].toUpperCase() + z.slice(1)}</button>`).join('')}</div>
                            <button class="btn btn-ghost btn-sm" data-act="jtToday">Today</button>
                            <div class="seg small" role="radiogroup" aria-label="Layout">${[['list', '☰ List'], ['both', '☰▦ List + chart'], ['chart', '▦ Chart']].map(([k, l]) => `<button role="radio" aria-checked="${mode === k}" data-act="jtMode" data-v="${k}">${l}</button>`).join('')}</div>
                        </div>
                        <div class="toolbar">
                            ${conflicts ? `<button class="btn btn-danger btn-sm" data-act="jtFix" title="Move items so every dependency is respected">⚠ ${conflicts} broken dependenc${conflicts === 1 ? 'y' : 'ies'} · Fix</button>` : ''}
                            <label class="small" style="display: flex; gap: 0.35rem; align-items: center;"><input type="checkbox" data-change="jtCritical" ${A.state.showCritical ? 'checked' : ''}> Critical path</label>
                            ${PMT.exporter.menu('gantt')}
                            <button class="btn btn-ghost btn-sm" data-act="newGroup">＋ ${esc(A.F.wbs ? 'Deliverable' : 'Epic')}</button>
                        </div>
                    </div>
                    <div class="jt ${mode}" style="--jl:${leftW}px; --row:${ROW}px; ${COLS.map(c => `--c-${c.k}:${A.state.gCols[c.k]}px`).join('; ')}">
                        <div class="jt-scroll" id="jtScroll">
                            <div class="jt-body" style="${mode === 'list' ? '' : `width:calc(var(--jl) + ${trackW}px)`}">
                                <div class="jt-row jt-head">
                                    <div class="jt-left jt-cols"><span class="jt-indent-sp"></span><span class="jt-chev"></span><span class="jt-type-sp"></span>${COLS.filter(c => showFields || !c.field).map(c => `<span class="jt-hc h-${c.k}">${c.label}<span class="jt-rz" data-col="${c.k}" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize ${c.label} column (use arrow keys)" aria-valuenow="${A.state.gCols[c.k]}" aria-valuemin="${c.min}" aria-valuemax="${c.max}" title="Drag to resize · double-click to reset"></span></span>${c.k === 'sum' ? '<span class="jt-add-sp"></span>' : ''}`).join('')}<span class="h-done">Done</span>${mode !== 'list' ? '<span class="jt-rz jt-split" data-col="sum" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Widen or narrow the table (use arrow keys)" title="Drag to widen or narrow the table"></span>' : ''}</div>
                                    <div class="jt-track jt-time" style="width:${trackW}px"><div class="jt-months">${months}</div><div class="jt-days">${days}</div></div>
                                </div>
                                ${msRow}
                                <div class="jt-rows" style="height:${rows.length * ROW}px">
                                    <div class="jt-weekends" style="width:${trackW}px">${weekends}</div>
                                    ${today >= start && today <= end ? `<span class="jt-today" style="left:calc(var(--jl) + ${x(today) + dayW / 2}px)"></span>` : ''}
                                    ${body}
                                    <svg class="jt-deps" width="${trackW}" height="${rows.length * ROW}" style="left:var(--jl)">
                                        <defs><marker id="jtArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#6B7A90"/></marker>
                                        <marker id="jtArrBad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#E5484D"/></marker></defs>
                                        ${paths.join('')}<path id="jtTemp" class="jt-temp" d=""/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p class="muted small" style="margin-top: 0.6rem;">Drag a bar to move it · drag its ends to change dates · drag the ● onto another bar to add a dependency · click an arrow to remove it · click ＋ to add a subtask.</p>`
            };
        },

        mount(root) {
            const scroller = root.querySelector('#jtScroll');
            if (!scroller) return;
            // Keep the horizontal position across re-renders; start near today the first time
            if (A.state.gScroll == null) {
                const todayX = D.daysBetween(ctx.start, D.todayISO()) * ctx.dayW;
                scroller.scrollLeft = Math.max(0, todayX - 3 * 7 * ctx.dayW);
            } else scroller.scrollLeft = A.state.gScroll;
            scroller.addEventListener('scroll', () => { A.state.gScroll = scroller.scrollLeft; });

            const search = root.querySelector('#gSearch');
            search.addEventListener('input', () => {
                A.state.gSearch = search.value;
                const pos = search.selectionStart;
                A.render();
                const again = document.getElementById('gSearch');
                again.focus();
                again.setSelectionRange(pos, pos);
            });
            if (A.state.addSubFor) root.querySelector(`[data-form="jtCreate"][data-parent="${A.state.addSubFor}"] input`)?.focus();

            const body = root.querySelector('.jt-body');
            body.addEventListener('pointerdown', onPointerDown);
        }
    });

    // ─── Dragging ───
    function onPointerDown(e) {
        if (e.button !== 0) return;
        const rz = e.target.closest('.jt-rz');
        if (rz) return startResize(e, rz);
        const link = e.target.closest('[data-link]');
        const handle = e.target.closest('[data-drag]');
        const emptyTrack = e.target.closest('.jt-track[data-empty]');
        if (link) return startLink(e, link.dataset.link);
        if (handle) return startDrag(e, handle);
        if (emptyTrack) return scheduleAt(e, emptyTrack);
    }

    function setColWidth(k, w) {
        const c = COLS.find(x => x.k === k);
        A.state.gCols[k] = Math.round(Math.max(c.min, Math.min(c.max, w)));
        const jt = document.querySelector('.jt');
        jt.style.setProperty(`--c-${k}`, `${A.state.gCols[k]}px`);
        jt.style.setProperty('--jl', `${leftWidth(A.state.gMode !== 'chart')}px`);
        jt.querySelectorAll(`.jt-rz[data-col="${k}"]`).forEach(h => h.setAttribute('aria-valuenow', A.state.gCols[k]));
    }
    function startResize(e, rz) {
        e.preventDefault();
        const k = rz.dataset.col, x0 = e.clientX, w0 = A.state.gCols[k];
        document.body.classList.add('jt-resizing');
        const move = ev => setColWidth(k, w0 + ev.clientX - x0);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            document.body.classList.remove('jt-resizing');
            savePrefs();
            A.render();   // date labels switch format with the column width
            document.querySelector(`.jt-rz[data-col="${k}"]`)?.focus({ preventScroll: true });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }
    document.addEventListener('keydown', e => {
        const rz = e.target.closest && e.target.closest('.jt-rz');
        if (!rz || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        const k = rz.dataset.col;
        setColWidth(k, A.state.gCols[k] + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 40 : 10));
        savePrefs();
    });
    document.addEventListener('dblclick', e => {
        const rz = e.target.closest && e.target.closest('.jt-rz');
        if (!rz) return;
        setColWidth(rz.dataset.col, COLS.find(c => c.k === rz.dataset.col).def);
        savePrefs();
        A.render();
    });

    function startDrag(e, handle) {
        e.preventDefault();
        const bar = handle.closest('.jt-bar');
        const it = A.item(bar.dataset.bar);
        const t = PMT.schedule.buildSchedule(A.P).byId[it.id];
        const mode = handle.dataset.drag;
        const x0 = e.clientX, left0 = parseFloat(bar.style.left), width0 = parseFloat(bar.style.width);
        let delta = 0;
        try { bar.setPointerCapture(e.pointerId); } catch (_) { /* window listeners below still track the drag */ }
        bar.classList.add('dragging');
        const move = ev => {
            delta = Math.round((ev.clientX - x0) / ctx.dayW);
            const len = Math.round((width0 + 2) / ctx.dayW);
            if (mode === 'move') bar.style.left = `${left0 + delta * ctx.dayW}px`;
            if (mode === 'start') {
                const d = Math.min(delta, len - 1);
                bar.style.left = `${left0 + d * ctx.dayW}px`;
                bar.style.width = `${width0 - d * ctx.dayW}px`;
            }
            if (mode === 'end') bar.style.width = `${Math.max(ctx.dayW - 2, width0 + delta * ctx.dayW)}px`;
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            bar.classList.remove('dragging');
            if (delta === 0) { if (mode === 'move') A.openItem(it.id); return; }
            let s0 = t.startDate, e0 = t.endDate;
            if (mode === 'move') { s0 = D.addDays(s0, delta); e0 = D.addDays(e0, delta); }
            if (mode === 'start') s0 = D.addDays(s0, Math.min(delta, D.daysBetween(s0, e0)));
            if (mode === 'end') e0 = D.addDays(e0, Math.max(delta, -D.daysBetween(s0, e0)));
            it.startDate = s0; it.dueDate = e0; it.duration = D.spanDays(s0, e0);
            A.commit(`${A.keyOf(it)} dates set to ${D.fmt(s0)} – ${D.fmt(e0)}`);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    function startLink(e, fromId) {
        e.preventDefault();
        e.stopPropagation();
        const svg = document.querySelector('.jt-deps');
        const temp = document.getElementById('jtTemp');
        const bar = document.querySelector(`[data-bar="${fromId}"]`);
        const svgBox = svg.getBoundingClientRect(), barBox = bar.getBoundingClientRect();
        const x1 = barBox.right - svgBox.left, y1 = barBox.top + barBox.height / 2 - svgBox.top;
        document.body.classList.add('jt-linking');
        const move = ev => { temp.setAttribute('d', `M${x1} ${y1} L${ev.clientX - svgBox.left} ${ev.clientY - svgBox.top}`); };
        const up = ev => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            temp.setAttribute('d', '');
            document.body.classList.remove('jt-linking');
            const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-row-id]');
            const toId = target?.dataset.rowId;
            const to = toId && A.item(toId);
            if (!to || to.kind === 'group' || toId === fromId) return;
            if ((to.deps || []).includes(fromId)) return toast('That dependency already exists.');
            if (PMT.schedule.wouldCycle(A.P.items, toId, fromId)) return toast('That would create a loop of dependencies.', 'warn');
            to.deps = [...(to.deps || []), fromId];
            const from = A.item(fromId);
            if (!to.startDate && !to.duration) to.duration = 1;
            A.commit(`${A.keyOf(to)} now waits for ${A.keyOf(from)}`, `${A.keyOf(to)} now waits for ${A.keyOf(from)}`, 'good');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    function scheduleAt(e, track) {
        const row = track.closest('[data-row-id]');
        const it = A.item(row.dataset.rowId);
        const offset = e.clientX - track.getBoundingClientRect().left;
        const startDate = D.nextWorkday(D.addDays(ctx.start, Math.floor(offset / ctx.dayW)));
        const len = Math.max(1, Number(it.duration) || 3);
        it.startDate = startDate;
        it.dueDate = D.addWorkdays(startDate, len - 1);
        it.duration = len;
        A.commit(`Scheduled ${A.keyOf(it)} for ${D.fmt(it.startDate)} – ${D.fmt(it.dueDate)}`, `Scheduled ${A.keyOf(it)}. Drag the bar to adjust.`, 'good');
    }


    // ════════════════ Download: PNG image, CSV spreadsheet, print / PDF ════════════════
    const safeName = () => A.P.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
    const BAR = { backlog: '#8FA3BF', todo: '#8FA3BF', doing: '#2F6FD0', review: '#7A5CD6', done: '#36B37E' };

    // Draw the chart on a canvas: table + timeline, independent of screen size
    function ganttCanvas() {
        const P = A.P, s = PMT.schedule.buildSchedule(P);
        const rows = buildRows().filter(r => r.kind !== 'create');
        const today = D.todayISO();
        const dates = [P.startDate, ...Object.values(s.byId).flatMap(t => [t.startDate, t.endDate]), ...P.milestones.map(m => m.targetDate).filter(Boolean)].sort();
        const start = mondayOf(D.addDays(dates[0], -3));
        const end = D.addDays(dates[dates.length - 1], 7);
        const total = D.daysBetween(start, end) + 1;
        const dayW = Math.max(4, Math.min(22, Math.floor(2400 / total)));
        const COLS = [['Key', 74], ['Summary', 300], ['Status', 92], ['Assignee', 110], ['Start', 86], ['Due', 86]];
        const tableW = COLS.reduce((a, c) => a + c[1], 0);
        const RH = 28, TOP = 70, HEAD = 42;
        const msRow = P.milestones.some(m => m.targetDate);
        const W = tableW + total * dayW + 2, H = TOP + HEAD + (msRow ? RH : 0) + rows.length * RH + 34;
        const scale = Math.max(1, Math.min(2, 16000 / W, 16000 / H));
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
        const g = cv.getContext('2d');
        g.scale(scale, scale);
        const font = (w, px) => `${w} ${px}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;
        const fit = (text, max) => { text = String(text || ''); if (g.measureText(text).width <= max) return text; while (text && g.measureText(text + '…').width > max) text = text.slice(0, -1); return text + '…'; };
        const x0 = tableW, x = iso => x0 + D.daysBetween(start, iso) * dayW;
        const y0 = TOP + HEAD + (msRow ? RH : 0);

        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
        // Title block
        g.fillStyle = '#1F2A37'; g.font = font(700, 20); g.fillText(fit(P.name, W - 40), 14, 30);
        g.fillStyle = '#6B7280'; g.font = font(400, 12);
        g.fillText(`Gantt chart · ${PMT.methodName(P.method)} · ${D.fmt(s.start, { day: 'numeric', month: 'short', year: 'numeric' })} → ${D.fmt(s.finishDate, { day: 'numeric', month: 'short', year: 'numeric' })} · exported ${D.fmt(today, { day: 'numeric', month: 'short', year: 'numeric' })}`, 14, 52);

        // Weekend shading + month/week header
        for (let k = 0; k < total; k++) {
            const iso = D.addDays(start, k), dw = D.toDate(iso).getUTCDay();
            if (dayW >= 8 && (dw === 0 || dw === 6)) { g.fillStyle = '#F4F6F8'; g.fillRect(x0 + k * dayW, TOP + HEAD, dayW, H - TOP - HEAD - 34); }
        }
        g.fillStyle = '#FAFBFC'; g.fillRect(0, TOP, W, HEAD);
        g.strokeStyle = '#E2E5E9'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, TOP + HEAD + 0.5); g.lineTo(W, TOP + HEAD + 0.5); g.stroke();
        g.font = font(700, 11); g.fillStyle = '#6B7280';
        let cx = 8;
        COLS.forEach(([label, w]) => { g.fillText(label.toUpperCase(), cx, TOP + 26); cx += w; });
        for (let k = 0; k < total; k++) {
            const iso = D.addDays(start, k), d = D.toDate(iso);
            if (d.getUTCDate() === 1 || k === 0) {
                g.fillStyle = '#1F2A37'; g.font = font(700, 11);
                g.fillText(d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }), x0 + k * dayW + 4, TOP + 16);
                g.strokeStyle = '#D5D9DE'; g.beginPath(); g.moveTo(x0 + k * dayW + 0.5, TOP); g.lineTo(x0 + k * dayW + 0.5, TOP + HEAD); g.stroke();
            }
            if (d.getUTCDay() === 1) {
                g.fillStyle = '#6B7280'; g.font = font(400, 10);
                g.fillText(String(d.getUTCDate()), x0 + k * dayW + 3, TOP + 34);
                g.strokeStyle = '#EEF0F2'; g.beginPath(); g.moveTo(x0 + k * dayW + 0.5, TOP + 22); g.lineTo(x0 + k * dayW + 0.5, H - 34); g.stroke();
            }
        }
        g.strokeStyle = '#E2E5E9'; g.beginPath(); g.moveTo(x0 + 0.5, TOP); g.lineTo(x0 + 0.5, H - 34); g.stroke();

        // Milestones row
        if (msRow) {
            const my = TOP + HEAD;
            g.fillStyle = '#1F2A37'; g.font = font(700, 12); g.fillText('◆ Milestones', 8, my + 18);
            P.milestones.filter(m => m.targetDate).forEach(m => {
                const items = m.itemIds.map(A.item).filter(Boolean);
                const reached = items.length && items.every(i => i.status === 'done');
                const f = PMT.schedule.milestoneForecast(P, m, s);
                const late = !reached && f && f > m.targetDate;
                const mx = x(m.targetDate) + dayW / 2, myc = my + RH / 2;
                g.fillStyle = reached ? '#1F9D6B' : late ? '#E5484D' : '#1F2A37';
                g.beginPath(); g.moveTo(mx, myc - 7); g.lineTo(mx + 7, myc); g.lineTo(mx, myc + 7); g.lineTo(mx - 7, myc); g.closePath(); g.fill();
                g.font = font(600, 10); g.fillStyle = '#1F2A37'; g.fillText(fit(m.name, 140), mx + 10, myc + 4);
            });
            g.strokeStyle = '#E2E5E9'; g.beginPath(); g.moveTo(0, y0 - 0.5); g.lineTo(W, y0 - 0.5); g.stroke();
        }

        // Rows: table cells + bars
        const rowY = {};
        rows.forEach((r, n) => {
            const y = y0 + n * RH;
            if (r.item) rowY[r.item.id] = y + RH / 2;
            if (r.kind === 'group' || r.kind === 'label') { g.fillStyle = r.kind === 'group' ? '#FBFAFF' : '#F7F8FA'; g.fillRect(0, y, W, RH); }
            g.strokeStyle = '#EEF0F2'; g.beginPath(); g.moveTo(0, y + RH - 0.5); g.lineTo(W, y + RH - 0.5); g.stroke();
            if (r.kind === 'label') { g.fillStyle = '#6B7280'; g.font = font(400, 11); g.fillText(r.text, 8, y + 18); return; }
            const i = r.item, indent = r.depth * 14;
            if (r.kind === 'group') {
                const all = descendants(i.id), done = all.filter(z => z.status === 'done').length;
                const sp = all.map(z => s.byId[z.id]).filter(Boolean);
                g.fillStyle = '#904EE2'; g.fillRect(8, y + 8, 12, 12);
                g.fillStyle = '#1F2A37'; g.font = font(700, 12);
                g.fillText(fit(`${A.code(i) ? A.code(i) + ' ' : ''}${i.title}`, COLS[0][1] + COLS[1][1] - 30), 26, y + 18);
                g.font = font(400, 11); g.fillStyle = '#6B7280';
                g.fillText(`${done}/${all.length} done`, COLS[0][1] + COLS[1][1] + 8, y + 18);
                if (sp.length) {
                    const gs = sp.map(t => t.startDate).sort()[0], ge = sp.map(t => t.endDate).sort().pop();
                    g.fillText(`${D.fmt(gs)} – ${D.fmt(ge)}`, tableW - COLS[5][1] - COLS[4][1] + 8, y + 18);
                    const bx = x(gs), bw = (D.daysBetween(gs, ge) + 1) * dayW - 2;
                    g.fillStyle = '#D9C8F7'; g.fillRect(bx, y + 11, bw, 7);
                    g.fillStyle = '#904EE2'; g.fillRect(bx, y + 11, bw * (all.length ? done / all.length : 0), 7);
                }
                return;
            }
            const t = s.byId[i.id], m = A.member(i.assigneeId);
            let cx2 = 8;
            g.font = font(600, 11); g.fillStyle = '#4B6584'; g.fillText(fit(A.keyOf(i), COLS[0][1] - 10), cx2, y + 18); cx2 += COLS[0][1];
            g.font = font(400, 12); g.fillStyle = i.status === 'done' ? '#9AA0A6' : '#1F2A37';
            g.fillText(fit(`${A.isSubtask(i) ? '↳ ' : ''}${i.title}`, COLS[1][1] - 12 - indent), cx2 + indent, y + 18); cx2 += COLS[1][1];
            g.font = font(700, 10); g.fillStyle = BAR[i.status]; g.fillText(STATUS[i.status].toUpperCase(), cx2, y + 18); cx2 += COLS[2][1];
            g.font = font(400, 11); g.fillStyle = '#2D3748'; g.fillText(fit(m ? m.name : '—', COLS[3][1] - 10), cx2, y + 18); cx2 += COLS[3][1];
            g.fillText(t ? D.fmt(t.startDate) : '—', cx2, y + 18); cx2 += COLS[4][1];
            g.fillText(t ? D.fmt(t.endDate) : '—', cx2, y + 18);
            if (t) {
                const bx = x(t.startDate), bw = Math.max(dayW - 2, (D.daysBetween(t.startDate, t.endDate) + 1) * dayW - 2);
                g.fillStyle = BAR[i.status];
                g.beginPath(); (g.roundRect ? g.roundRect(bx, y + 6, bw, 16, 3) : g.rect(bx, y + 6, bw, 16)); g.fill();
                if (A.state.showCritical && t.critical && i.status !== 'done') { g.strokeStyle = '#E5484D'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
                if (bw > 40) { g.fillStyle = '#FFFFFF'; g.font = font(700, 10); g.fillText(fit(`${i.status === 'done' ? '✓ ' : ''}${A.keyOf(i)}`, bw - 8), bx + 5, y + 18); }
            }
        });

        // Dependency arrows
        rows.forEach(r => {
            if (!r.item || r.kind !== 'item') return;
            const t = s.byId[r.item.id];
            if (!t) return;
            (r.item.deps || []).forEach(dep => {
                const pt = s.byId[dep];
                if (!pt || rowY[dep] == null) return;
                const bad = s.conflicts.some(c => c.from === dep && c.to === r.item.id);
                const x1 = x(pt.endDate) + dayW - 2, y1 = rowY[dep], x2 = x(t.startDate), y2 = rowY[r.item.id];
                g.strokeStyle = bad ? '#E5484D' : '#6B7A90'; g.fillStyle = g.strokeStyle; g.lineWidth = bad ? 1.8 : 1.3;
                g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + 6, y1); g.lineTo(x1 + 6, y2); g.lineTo(x2 - 1, y2); g.stroke();
                g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 6, y2 - 4); g.lineTo(x2 - 6, y2 + 4); g.closePath(); g.fill();
                g.lineWidth = 1;
            });
        });

        // Today line + legend
        if (today >= start && today <= end) { g.fillStyle = '#FF6B5B'; g.fillRect(x(today) + dayW / 2 - 1, TOP + HEAD, 2, H - TOP - HEAD - 34); }
        let lx = 14; const ly = H - 14;
        g.font = font(400, 11);
        [['To do', BAR.todo], ['In progress', BAR.doing], ['Review', BAR.review], ['Done', BAR.done], ['Today', '#FF6B5B']].forEach(([label, c]) => {
            g.fillStyle = c; g.fillRect(lx, ly - 9, 14, 10); g.fillStyle = '#2D3748'; g.fillText(label, lx + 19, ly); lx += g.measureText(label).width + 40;
        });
        g.fillStyle = '#9AA0A6'; g.fillText('Made with PM Ready', W - 120, ly);
        return cv;
    }

    const closeMenu = () => PMT.exporter.closeMenus();

    A.action('ganttPng', async () => {
        closeMenu();
        if (await PMT.exporter.png(ganttCanvas(), `${safeName()}-gantt.png`)) toast('Gantt chart downloaded as an image', 'good');
        else toast('Could not create the image. Try collapsing some rows.', 'bad');
    });
    A.action('ganttPdf', async () => {
        closeMenu();
        if (await PMT.exporter.pdf(ganttCanvas(), `${safeName()}-gantt.pdf`, `${A.P.name} - Gantt chart`)) toast('Gantt chart downloaded as a PDF', 'good');
        else toast('Could not create the PDF. Try collapsing some rows.', 'bad');
    });

    A.action('ganttCsv', () => {
        closeMenu();
        const s = PMT.schedule.buildSchedule(A.P);
        const q = v => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const head = ['Key', 'WBS', 'Type', 'Summary', A.groupWord(), 'Parent', 'Status', 'Assignee', 'Assignee email', 'Start', 'Due', 'Working days', 'Depends on', 'Milestones'];
        if (A.F.points) head.push('Estimate (points)');
        if (A.F.moscow) head.push('Priority');
        if (A.F.iterations) head.push(A.F.iterName);
        const lines = [head.map(q).join(',')];
        const ordered = [];
        const walk = (i, depth) => { ordered.push(i); A.subtasksOf(i.id).forEach(c => walk(c, depth + 1)); };
        A.groups().forEach(g => A.childrenOf(g.id).forEach(i => walk(i, 1)));
        A.ranked().filter(i => !i.parentId || !A.item(i.parentId)).forEach(i => walk(i, 0));
        ordered.forEach(i => {
            const t = s.byId[i.id], m = A.member(i.assigneeId);
            let grp = A.item(i.parentId); while (grp && grp.kind !== 'group') grp = A.item(grp.parentId);
            const row = [A.keyOf(i), A.code(i), A.isSubtask(i) ? 'Subtask' : ({ task: 'Task', story: 'Story', bug: 'Bug' }[i.type] || 'Task'), i.title, grp ? grp.title : '', A.isSubtask(i) ? A.keyOf(A.item(i.parentId)) : '', STATUS[i.status], m ? m.name : '', m ? m.email || '' : '',
                t ? t.startDate : '', t ? t.endDate : '', t ? t.duration : '', (i.deps || []).map(d => A.item(d)).filter(Boolean).map(A.keyOf).join(' '), A.P.milestones.filter(x => x.itemIds.includes(i.id)).map(x => x.name).join('; ')];
            if (A.F.points) row.push(i.estimate ?? '');
            if (A.F.moscow) row.push(i.moscow ? ({ M: 'Must', S: 'Should', C: 'Could', W: "Won't" })[i.moscow] : '');
            if (A.F.iterations) row.push(A.P.iterations.find(x => x.id === i.iterationId)?.name || '');
            lines.push(row.map(q).join(','));
        });
        // BOM so Excel opens UTF-8 correctly
        PMT.ui.download(`${safeName()}-gantt.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
        toast(`Exported ${ordered.length} items as a spreadsheet`, 'good');
    });

    // ─── List actions ───
    A.action('jtToggle', el => { A.state.collapsed[el.dataset.id] = !A.state.collapsed[el.dataset.id]; A.render(); document.querySelector(`[data-act="jtToggle"][data-id="${el.dataset.id}"]`)?.focus(); });
    A.action('jtZoom', el => { A.state.ganttZoom = el.dataset.v; A.state.gScroll = null; A.render(); });
    A.action('jtMode', el => { A.state.gMode = el.dataset.v; savePrefs(); A.render(); });
    A.action('jtToday', () => { A.state.gScroll = null; A.render(); });
    A.action('jtCritical', el => { A.state.showCritical = el.checked; A.render(); });
    A.action('jtAddSub', el => {
        A.state.addSubFor = A.state.addSubFor === el.dataset.id ? null : el.dataset.id;
        A.state.collapsed[el.dataset.id] = false;
        A.render();
    });
    A.action('jtStatus', el => { const it = A.item(el.dataset.id); if (A.setStatus(it, el.value)) A.commit(); else el.value = it.status; });
    A.action('jtWho', el => { const it = A.item(el.dataset.id); it.assigneeId = el.value || null; A.commit(`${A.keyOf(it)} assigned to ${A.member(it.assigneeId)?.name || 'nobody'}`); });
    A.action('jtTick', el => {
        const it = A.item(el.dataset.id);
        const next = it.status === 'done' ? 'todo' : 'done';
        if (A.setStatus(it, next)) A.commit(null, next === 'done' ? `${A.keyOf(it)} done ✓` : null, 'good');
    });
    A.action('jtDate', el => {
        const it = A.item(el.dataset.id);
        const s = PMT.schedule.buildSchedule(A.P).byId[it.id];
        let start = it.startDate || s?.startDate || null, due = it.dueDate || s?.endDate || null;
        if (el.dataset.field === 'startDate') {
            if (!el.value) { it.startDate = null; it.dueDate = null; return A.commit(`Cleared dates of ${A.keyOf(it)}`); }
            const len = start && due ? D.daysBetween(start, due) : Math.max(0, (Number(it.duration) || 1) - 1);
            start = el.value;
            if (!due || due < start) due = D.addDays(start, len);
        } else {
            if (!el.value) { it.startDate = null; it.dueDate = null; return A.commit(`Cleared dates of ${A.keyOf(it)}`); }
            due = el.value;
            if (!start || start > due) start = due;
        }
        it.startDate = start; it.dueDate = due; it.duration = D.spanDays(start, due);
        A.commit(`${A.keyOf(it)} dates set to ${D.fmt(start)} – ${D.fmt(due)}`);
    });
    A.action('jtPickDate', el => {
        const input = el.nextElementSibling;
        try { input.showPicker(); }
        catch (_) { A.openItem(input.dataset.id); }   // browsers without showPicker: edit in the dialog
    });
    A.action('jtUnlink', el => {
        const to = A.item(el.dataset.to), from = A.item(el.dataset.from);
        if (!confirm(`Remove the dependency: ${A.keyOf(to)} waits for ${A.keyOf(from)}?`)) return;
        to.deps = (to.deps || []).filter(d => d !== from.id);
        A.commit(`Removed dependency ${A.keyOf(from)} → ${A.keyOf(to)}`, 'Dependency removed');
    });
    A.action('jtFix', () => {
        const moved = PMT.schedule.resolveConflicts(A.P);
        A.work().forEach(i => { if (i.startDate && i.dueDate) i.duration = D.spanDays(i.startDate, i.dueDate); });
        A.commit(`Fixed dependency conflicts (${moved} move${moved === 1 ? '' : 's'})`, `Moved ${moved} item${moved === 1 ? '' : 's'} so every dependency is respected`, 'good');
    });
    A.action('jtCreate', (form, v) => {
        const title = (v.title || '').trim();
        if (!title) return;
        const parentId = form.dataset.parent || null;
        const parent = parentId ? A.item(parentId) : null;
        const it = A.newItem({ title, parentId, order: A.work().filter(x => x.parentId === parentId).length, status: 'todo' });
        if (parent && parent.kind !== 'group') {
            it.iterationId = parent.iterationId || null;
            it.assigneeId = parent.assigneeId || null;
        }
        A.P.items.push(it);
        A.log(`Created ${A.keyOf(it)} "${title}"`);
        A.commit(null, `Created ${A.keyOf(it)}`, 'good');
        document.querySelector(`[data-form="jtCreate"][data-parent="${parentId || ''}"] input`)?.focus();
    });
})();
