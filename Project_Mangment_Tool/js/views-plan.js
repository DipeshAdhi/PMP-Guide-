/* Views: Iterations, Schedule, Milestones, Team, Change requests, Risks, Settings */
(function () {
    const A = PMT.app;
    const { esc, toast, avatar, STATUS, MOSCOW } = PMT.ui;
    const D = PMT.dates;
    const pts = items => items.reduce((s, i) => s + (Number(i.estimate) || 0), 0);
    const statusPill = s => `<span class="pill ${s}">${STATUS[s]}</span>`;
    const memberOptions = (sel, none = 'Unassigned') => `<option value="">${none}</option>${A.P.members.map(m => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;

    // ══════════════════════════ Iterations ══════════════════════════
    function velocity() {
        const v = A.P.iterations.filter(i => i.status === 'closed').slice(-3).map(i => i.velocity || 0);
        return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    }
    function burndownSvg(it) {
        const items = A.work().filter(i => i.iterationId === it.id);
        const total = pts(items);
        const dayList = D.workdaysInRange(it.start, it.end);
        if (!dayList.length || !total) return '<p class="muted small">The burndown appears once the iteration has estimated items.</p>';
        const today = D.todayISO();
        const remaining = dayList.map(d => d > today ? null : total - pts(items.filter(i => i.status === 'done' && i.doneAt && i.doneAt.slice(0, 10) <= d)));
        const W = 520, H = 200, L = 34, R = 10, T = 12, B = 26, n = dayList.length;
        const x = k => L + (n === 1 ? 0 : k / (n - 1)) * (W - L - R);
        const y = v => T + (1 - v / total) * (H - T - B);
        const pts2 = remaining.map((v, k) => v == null ? null : `${x(k)},${y(v)}`).filter(Boolean);
        return `<svg viewBox="0 0 ${W} ${H}" style="width: 100%; height: auto;" role="img" aria-label="Burndown: ${remaining.filter(v => v != null).slice(-1)[0] ?? total} of ${total} points remaining">
            ${[0, 0.5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(total * f)}" y2="${y(total * f)}" stroke="#E2E5E9"/><text x="${L - 6}" y="${y(total * f) + 4}" font-size="10" text-anchor="end" fill="#6B7280">${Math.round(total * f)}</text>`).join('')}
            ${dayList.map((d, k) => (k === 0 || k === n - 1 || k % 5 === 0) ? `<text x="${x(k)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#6B7280">${D.fmt(d)}</text>` : '').join('')}
            <line x1="${x(0)}" y1="${y(total)}" x2="${x(n - 1)}" y2="${y(0)}" stroke="#9CA3AF" stroke-dasharray="5 4" stroke-width="2"/>
            ${pts2.length ? `<polyline fill="none" stroke="#168C86" stroke-width="3" points="${pts2.join(' ')}"/>${pts2.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="#168C86"/>`).join('')}` : ''}
        </svg>
        <div class="small muted" style="display: flex; gap: 1rem;"><span>━ Actual</span><span>┅ Ideal</span></div>`;
    }

    A.register('iterations', {
        render() {
            const F = A.F, P = A.P, name = F.iterName;
            const active = A.activeIteration(), planned = A.plannedIteration();
            const closed = P.iterations.filter(i => i.status === 'closed');
            const v = velocity();
            const len = Number(P.settings.iterationDays) || F.defaultIterationDays;

            let activeHtml = '';
            if (active) {
                const items = A.work().filter(i => i.iterationId === active.id);
                const done = pts(items.filter(i => i.status === 'done')), total = pts(items);
                const left = D.workdaysInRange(D.todayISO(), active.end).length;
                activeHtml = `<div class="card" style="border-top: 4px solid var(--teal-d); margin-bottom: 1rem;">
                    <div class="view-head" style="margin-bottom: 0.4rem;"><div><h3 style="margin: 0;">▶ ${esc(active.name)} <span class="pill doing">Active</span></h3>
                        <div class="muted small">${D.fmt(active.start)} – ${D.fmt(active.end)} · ${left > 0 ? `${left} working day${left === 1 ? '' : 's'} left` : 'timebox over'}${active.goal ? ` · Goal: ${esc(active.goal)}` : ''}</div></div>
                        <div class="toolbar"><a class="btn btn-ghost" href="#board">Open board</a><button class="btn btn-primary" data-act="completeIteration">Complete ${esc(name.toLowerCase())}</button></div></div>
                    <div class="grid grid-2">
                        <div>${burndownSvg(active)}</div>
                        <div><div class="kpi"><div class="n">${done}/${total}</div><div class="l">points done</div></div>
                            <div class="bar" style="margin: 0.5rem 0 0.8rem;"><div style="width:${total ? done / total * 100 : 0}%"></div></div>
                            ${items.map(i => `<div style="display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid var(--line-2); font-size: 0.86rem;"><button class="icon-btn" style="color: var(--ink); text-align: left;" data-act="openItem" data-id="${i.id}">${esc(i.title)}</button><span style="white-space: nowrap;">${i.estimate ?? '?'} pt ${statusPill(i.status)}</span></div>`).join('') || '<p class="muted small">No items in this iteration.</p>'}
                        </div>
                    </div></div>`;
            }

            let planHtml;
            if (planned) {
                const inIt = A.topItems().filter(i => i.iterationId === planned.id);
                const candidates = A.topItems().filter(i => i.status !== 'done' && (!i.iterationId || P.iterations.find(x => x.id === i.iterationId)?.status === 'closed'));
                const planPts = pts(inIt);
                const cap = v;
                const over = cap != null && planPts > cap;
                const plannedList = A.plannedIterations();
                const isNext = plannedList[0].id === planned.id;
                const startBlock = active ? `Complete ${active.name} first` : !isNext ? `Start ${plannedList[0].name} first` : !inIt.length ? 'Add items first' : '';
                planHtml = `<div class="card" style="margin-bottom: 1rem;">
                    <div class="toolbar" style="margin-bottom: 0.9rem;" role="group" aria-label="Planned ${name.toLowerCase()}s">
                        ${plannedList.map(p => `<button class="btn btn-sm ${p.id === planned.id ? 'btn-primary' : 'btn-ghost'}" data-act="selectPlan" data-id="${p.id}" aria-pressed="${p.id === planned.id}">${esc(p.name)} · ${D.fmt(p.start)}</button>`).join('')}
                        <button class="btn btn-ghost btn-sm" data-act="planIteration">＋ Plan another ${name.toLowerCase()}</button>
                        ${F.timeline ? '<a class="btn btn-ghost btn-sm" href="#timeline">🗓️ See them on the timeline</a>' : ''}
                    </div>
                    <div class="view-head" style="margin-bottom: 0.6rem;"><div><h3 style="margin: 0;">🗓️ Planning ${esc(planned.name)}</h3><div class="muted small">${D.fmt(planned.start)} – ${D.fmt(planned.end)} · ${len} working days</div></div>
                        <div class="toolbar"><button class="btn btn-ghost btn-sm" data-act="cancelIteration">Discard plan</button><button class="btn btn-primary" data-act="startIteration" ${startBlock ? 'disabled' : ''} title="${startBlock}">▶ Start ${esc(planned.name)}</button></div></div>
                    <form data-form="iterGoal" class="row" style="grid-template-columns: 1fr 180px auto; align-items: end; margin-bottom: 1rem;">
                        <div class="field" style="margin: 0;"><label for="itGoal">${name} goal: why is this ${name.toLowerCase()} worth doing?</label><input class="input" id="itGoal" name="goal" maxlength="160" value="${esc(planned.goal || '')}" placeholder="e.g. Parents can log in and see attendance"></div>
                        <div class="field" style="margin: 0;"><label for="itStart">Start date</label><input class="input" type="date" id="itStart" name="start" value="${planned.start}"></div>
                        <button class="btn btn-ghost" type="submit">Save</button>
                    </form>
                    <div class="grid grid-2">
                        <div><strong class="small">Ready to plan (top of the ${F.workLabel.toLowerCase()})</strong>
                            <div style="margin-top: 0.4rem;">${candidates.slice(0, 15).map(i => `<div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; background: #F8FAFB; border-radius: 8px; padding: 0.4rem 0.6rem; margin-bottom: 0.3rem; font-size: 0.86rem;">
                                <span>${F.moscow ? `<span class="pill ${i.moscow || 'S'}">${i.moscow || 'S'}</span> ` : ''}${esc(i.title)} <span class="muted">· ${i.estimate == null || i.estimate === '' ? '<span style="color: var(--warn);">needs estimate</span>' : i.estimate + ' pt'}</span></span>
                                <button class="btn btn-ghost btn-sm" data-act="planAdd" data-id="${i.id}" ${i.estimate == null || i.estimate === '' ? 'disabled title="Estimate it first"' : ''}>Add →</button></div>`).join('') || '<p class="muted small">Nothing left to plan.</p>'}</div></div>
                        <div><strong class="small">${esc(planned.name)}: ${planPts} points${cap != null ? ` of ~${cap} (average velocity)` : ''}</strong>
                            ${cap != null ? `<div class="bar" style="margin: 0.4rem 0;"><div style="width:${Math.min(100, planPts / cap * 100)}%; background:${over ? 'var(--crit)' : 'var(--teal)'}"></div></div>` : '<p class="muted small" style="margin: 0.3rem 0;">No velocity yet: plan what the team believes it can finish.</p>'}
                            ${over ? '<div class="note warn" style="margin-bottom: 0.5rem;">More than the team usually finishes. Overloading leads to unfinished work.</div>' : ''}
                            ${inIt.map(i => `<div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; background: var(--teal-bg); border-radius: 8px; padding: 0.4rem 0.6rem; margin-bottom: 0.3rem; font-size: 0.86rem;">
                                <span>${esc(i.title)} <span class="muted">· ${i.estimate} pt</span></span><button class="btn btn-ghost btn-sm" data-act="planRemove" data-id="${i.id}">← Remove</button></div>`).join('') || '<p class="muted small">Add items from the left.</p>'}
                        </div>
                    </div></div>`;
            } else {
                planHtml = `<div class="card" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
                    <div><h3 style="margin: 0;">Plan the next ${name.toLowerCase()}</h3><p class="muted small">Every ${name.toLowerCase()} is ${len} working days. Pick the items, set a goal, then start it.</p></div>
                    <button class="btn btn-primary" data-act="planIteration">＋ Plan ${name} ${P.iterations.length + 1}</button></div>`;
            }

            const historyHtml = closed.length ? `<div class="card"><h3>Completed ${name.toLowerCase()}s</h3>
                <div class="table-wrap"><table class="tbl"><thead><tr><th>${name}</th><th>Dates</th><th>Goal</th><th>Committed</th><th>Done (velocity)</th></tr></thead><tbody>
                ${closed.slice().reverse().map(i => `<tr><td><strong>${esc(i.name)}</strong></td><td class="small">${D.fmt(i.start)} – ${D.fmt(i.end)}</td><td class="small">${esc(i.goal || '—')}</td><td class="mono">${i.committed ?? 0} pt</td><td class="mono"><strong>${i.velocity ?? 0} pt</strong></td></tr>`).join('')}
                </tbody></table></div>${v != null ? `<p class="muted small" style="margin-top: 0.5rem;">Average velocity (last 3): <strong>${v} points</strong>.</p>` : ''}</div>` : '';

            return { sub: `Fixed ${len}-day ${name.toLowerCase()}s: plan, run, then review what was done`, html: activeHtml + planHtml + historyHtml };
        }
    });

    // New sprint straight after the latest one (or from today / the project start)
    A.createIteration = () => {
        const P = A.P, F = A.F;
        const len = Number(P.settings.iterationDays) || F.defaultIterationDays;
        const last = P.iterations.slice().sort((x, y) => x.end.localeCompare(y.end)).pop();
        const today = D.nextWorkday(D.todayISO() > P.startDate ? D.todayISO() : P.startDate);
        const start = last ? D.addWorkdays(last.end, 1) : today;
        const it = { id: PMT.uid('it_'), name: `${F.iterName} ${P.iterations.length + 1}`, goal: '', start, end: D.addWorkdays(start, len - 1), status: 'planned' };
        P.iterations.push(it);
        return it;
    };
    A.action('planIteration', () => {
        const it = A.createIteration();
        A.state.planIterId = it.id;
        A.commit(`Started planning ${it.name}`);
    });
    A.action('selectPlan', el => { A.state.planIterId = el.dataset.id; A.render(); });
    A.action('cancelIteration', () => {
        const it = A.plannedIteration();
        if (!it || !confirm(`Discard the plan for ${it.name}? Its items go back to the ${A.F.workLabel.toLowerCase()}.`)) return;
        A.work().filter(i => i.iterationId === it.id).forEach(i => { i.iterationId = null; });
        A.P.iterations = A.P.iterations.filter(x => x.id !== it.id);
        A.state.planIterId = null;
        A.commit(`Discarded the plan for ${it.name}`);
    });
    A.action('planAdd', el => { const i = A.item(el.dataset.id); i.iterationId = A.plannedIteration().id; A.syncSubtasks(i); A.commit(`Planned "${i.title}" into ${A.plannedIteration().name}`); });
    A.action('planRemove', el => { const i = A.item(el.dataset.id); i.iterationId = null; A.syncSubtasks(i); A.commit(`Removed "${i.title}" from the plan`); });
    A.action('iterGoal', (form, v) => {
        const it = A.plannedIteration();
        it.goal = v.goal.trim();
        if (v.start) { it.start = D.nextWorkday(v.start); it.end = D.addWorkdays(it.start, (Number(A.P.settings.iterationDays) || A.F.defaultIterationDays) - 1); }
        A.commit(null, 'Plan saved', 'good');
    });
    A.action('startIteration', () => {
        const it = A.plannedIteration();
        if (A.activeIteration()) return toast('Complete the active one first.', 'warn');
        if (A.plannedIterations()[0].id !== it.id) return toast(`Start ${A.plannedIterations()[0].name} first.`, 'warn');
        const items = A.work().filter(i => i.iterationId === it.id);
        if (!it.goal && !confirm('Start without a goal? A goal keeps the team focused.')) return;
        items.forEach(i => { if (i.status === 'backlog') i.status = 'todo'; });
        it.status = 'active';
        it.committed = pts(items);
        A.state.boardScope = 'iteration';
        A.commit(`Started ${it.name} with ${items.length} items (${it.committed} points)`, `${it.name} started`, 'good');
    });
    A.action('completeIteration', () => {
        const it = A.activeIteration();
        const items = A.work().filter(i => i.iterationId === it.id);
        const unfinished = items.filter(i => i.status !== 'done');
        if (!confirm(`Complete ${it.name}? ${unfinished.length ? `${unfinished.length} unfinished item(s) go back to the ${A.F.workLabel.toLowerCase()}.` : 'Everything is done.'}`)) return;
        it.velocity = pts(items.filter(i => i.status === 'done'));
        it.status = 'closed';
        it.closedAt = new Date().toISOString();
        unfinished.forEach(i => { i.iterationId = null; if (i.status === 'review' || i.status === 'doing') i.status = 'todo'; });
        A.state.boardScope = null;
        A.commit(`Completed ${it.name}: ${it.velocity} points done, ${unfinished.length} returned`, `${it.name} completed · velocity ${it.velocity}`, 'good');
    });

    // ══════════════════════════ Milestones ══════════════════════════
    // Milestone chart: one row per milestone, target ◇ vs forecast ◆ on a timeline
    function milestoneChart() {
        const d = A.msData();
        if (!d.rows.length) return '';
        const pct = iso => Math.max(0, Math.min(100, D.daysBetween(d.start, iso) / d.total * 100));
        const months = [];
        for (let k = 0; k <= d.total; k++) { const iso = D.addDays(d.start, k); if (D.toDate(iso).getUTCDate() === 1 || k === 0) months.push(iso); }
        return `<div class="card ms-card" style="margin-bottom: 1rem;">
            <div class="view-head" style="margin-bottom: 0.6rem;"><h3 style="margin: 0;">Milestone chart</h3>${PMT.exporter.menu('ms')}</div>
            <div class="msc">
                <div class="msc-axis"><span></span><div class="msc-track">${months.map(m => `<span style="left:${pct(m)}%">${D.toDate(m).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>`).join('')}</div><span></span></div>
                ${d.rows.map(r => `<div class="msc-row">
                    <div class="msc-name"><strong>◆ ${esc(r.m.name)}</strong><span class="${r.reached ? 'ok' : r.late ? 'bad' : ''}">${r.done}/${r.items.length} done · ${r.state}</span></div>
                    <div class="msc-track">
                        ${d.today >= d.start && d.today <= d.end ? `<i class="msc-today" style="left:${pct(d.today)}%"></i>` : ''}
                        ${r.m.targetDate && r.forecast && r.forecast !== r.m.targetDate ? `<i class="msc-slip ${r.slip > 0 ? 'late' : 'early'}" style="left:${Math.min(pct(r.m.targetDate), pct(r.forecast))}%; width:${Math.abs(pct(r.forecast) - pct(r.m.targetDate))}%"></i>` : ''}
                        ${r.m.targetDate ? `<i class="msc-dia target" style="left:${pct(r.m.targetDate)}%" title="Target ${D.fmt(r.m.targetDate)}"></i>` : ''}
                        ${r.forecast ? `<i class="msc-dia forecast ${r.reached ? 'reached' : r.late ? 'late' : ''}" style="left:${pct(r.forecast)}%" title="Forecast ${D.fmt(r.forecast)}"></i>` : ''}
                    </div>
                    <div class="msc-dates small"><span>Target ${r.m.targetDate ? D.fmt(r.m.targetDate) : '—'}</span><span class="${r.slip > 0 ? 'bad' : 'muted'}">Forecast ${r.forecast ? D.fmt(r.forecast) : '—'}${r.slip > 0 ? ` (+${r.slip}d)` : ''}</span></div>
                </div>`).join('')}
            </div>
            <div class="legend small muted" style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.6rem;"><span>◇ Target</span><span style="color: var(--teal-d);">◆ Forecast</span><span style="color: var(--crit);">◆ Late</span><span style="color: var(--ok);">◆ Reached</span><span style="color: var(--coral);">| Today</span></div>
        </div>`;
    }

    A.register('milestones', {
        render() {
            const P = A.P, F = A.F;
            const s = F.schedule ? PMT.schedule.buildSchedule(P) : null;
            const rows = P.milestones.map(m => {
                const items = m.itemIds.map(A.item).filter(Boolean);
                const done = items.filter(i => i.status === 'done').length;
                const f = s ? PMT.schedule.milestoneForecast(P, m, s) : null;
                const reached = items.length && done === items.length;
                const state = reached ? ['done', 'Reached'] : !items.length ? ['backlog', 'No items linked'] : f && m.targetDate && f > m.targetDate ? ['crit', 'Late'] : ['todo', 'On track'];
                return `<tr>
                    <td><strong>◆ ${esc(m.name)}</strong><div class="muted small">${items.length ? items.slice(0, 4).map(i => esc(i.title)).join(', ') + (items.length > 4 ? ` +${items.length - 4} more` : '') : 'Link items from the item editor'}</div></td>
                    <td><div class="bar" style="width: 90px;"><div style="width:${items.length ? done / items.length * 100 : 0}%"></div></div><span class="small muted">${done}/${items.length}</span></td>
                    <td><input class="input" type="date" style="width: 150px;" value="${m.targetDate || ''}" data-change="msTarget" data-id="${m.id}" aria-label="Target date for ${esc(m.name)}"></td>
                    ${s ? `<td class="small">${f ? D.fmt(f, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>` : ''}
                    <td><span class="pill ${state[0]}">${state[1]}</span></td>
                    <td style="white-space: nowrap;"><button class="icon-btn" data-act="msRename" data-id="${m.id}">Rename</button><button class="icon-btn" data-act="msDelete" data-id="${m.id}" aria-label="Delete ${esc(m.name)}">✕</button></td>
                </tr>`;
            }).join('');
            return {
                sub: 'Checkpoints with a target date. A milestone is reached when all its linked items are done.',
                html: `${milestoneChart()}
                    <div class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); align-items: start;">
                    <div>${P.milestones.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Milestone</th><th>Progress</th><th>Target</th>${s ? '<th>Forecast</th>' : ''}<th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
                        ${s ? '<div class="toolbar" style="margin-top: 0.8rem;"><button class="btn btn-ghost btn-sm" data-act="msRebaseline">Re-baseline: set every target to its forecast</button><span class="muted small">Do this only after an approved change.</span></div>' : ''}`
                        : '<div class="card empty"><div class="big">🏁</div><h3>No milestones yet</h3><p>Add the key checkpoints your sponsor cares about.</p></div>'}</div>
                    <form class="card" data-form="msAdd"><h3>Add a milestone</h3>
                        <div class="field"><label for="msName">Name</label><input class="input" id="msName" name="name" required maxlength="80" placeholder="e.g. Design approved"></div>
                        <div class="field"><label for="msDate">Target date</label><input class="input" type="date" id="msDate" name="target"></div>
                        <div class="field"><span class="label">Reached when these are done</span><div class="check-list">${A.work().map(i => `<label><input type="checkbox" name="item" value="${i.id}"> ${A.code(i) ? `<span class="mono muted">${A.code(i)}</span>` : ''} ${esc(i.title)}</label>`).join('') || '<span class="muted small">Add work items first.</span>'}</div></div>
                        <button class="btn btn-primary" type="submit">Add milestone</button>
                    </form></div>`
            };
        }
    });
    A.action('msAdd', (form, v) => {
        const name = v.name.trim();
        if (!name) return;
        const itemIds = new FormData(form).getAll('item');
        const m = { id: PMT.uid('ms_'), name, itemIds, targetDate: v.target || null };
        if (!m.targetDate && A.F.schedule) m.targetDate = PMT.schedule.milestoneForecast(A.P, m, PMT.schedule.buildSchedule(A.P));
        A.P.milestones.push(m);
        A.commit(`Added milestone "${name}"`, `Added ◆ ${name}`, 'good');
    });
    A.action('msTarget', el => { const m = A.P.milestones.find(x => x.id === el.dataset.id); m.targetDate = el.value || null; A.commit(`Set target of "${m.name}" to ${el.value || 'none'}`); });
    A.action('msRename', el => {
        const m = A.P.milestones.find(x => x.id === el.dataset.id);
        const n = prompt('Milestone name', m.name);
        if (n && n.trim()) { m.name = n.trim(); A.commit(`Renamed milestone to "${m.name}"`); }
    });
    A.action('msDelete', el => {
        const m = A.P.milestones.find(x => x.id === el.dataset.id);
        if (!confirm(`Delete milestone "${m.name}"?`)) return;
        A.P.milestones = A.P.milestones.filter(x => x !== m);
        A.commit(`Deleted milestone "${m.name}"`);
    });
    A.action('msRebaseline', () => {
        if (!confirm('Set every milestone target to its current forecast? Use this after a change has been approved.')) return;
        const s = PMT.schedule.buildSchedule(A.P);
        A.P.milestones.forEach(m => { const f = PMT.schedule.milestoneForecast(A.P, m, s); if (f) m.targetDate = f; });
        A.commit('Re-baselined milestone targets', 'Milestones re-baselined', 'good');
    });

    // ══════════════════════════ Team (+ RACI) ══════════════════════════
    const RACI = ['', 'R', 'A', 'C', 'I'];
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    A.register('team', {
        render() {
            const P = A.P, F = A.F;
            const groups = A.groups();
            let raciHtml = '';
            if (F.wbs && groups.length && P.members.length) {
                const warnings = [];
                groups.forEach(g => {
                    const vals = Object.values(g.raci || {});
                    const aN = vals.filter(x => x === 'A').length;
                    if (aN === 0) warnings.push(`<strong>${esc(g.title)}</strong>: no one is Accountable.`);
                    if (aN > 1) warnings.push(`<strong>${esc(g.title)}</strong>: ${aN} people are Accountable; keep exactly one.`);
                    if (!vals.includes('R')) warnings.push(`<strong>${esc(g.title)}</strong>: no one is Responsible.`);
                });
                raciHtml = `<div class="card" style="margin-top: 1rem;"><h3>Responsibility (RACI) by deliverable</h3>
                    <p class="muted small" style="margin-bottom: 0.6rem;">Click a cell to cycle R (does the work) → A (owns the result, exactly one) → C (consulted) → I (informed) → blank.</p>
                    <div class="table-wrap"><table class="tbl"><thead><tr><th>Deliverable</th>${P.members.map(m => `<th style="text-align: center;">${esc(m.name)}</th>`).join('')}</tr></thead><tbody>
                    ${groups.map(g => `<tr><td><span class="mono muted">${A.code(g)}</span> ${esc(g.title)}</td>${P.members.map(m => {
                        const v = (g.raci || {})[m.id] || '';
                        return `<td style="text-align: center;"><button class="raci-cell" data-act="raci" data-id="${g.id}" data-m="${m.id}" data-v="${v}" aria-label="${esc(g.title)}, ${esc(m.name)}: ${v || 'none'}">${v}</button></td>`;
                    }).join('')}</tr>`).join('')}</tbody></table></div>
                    ${warnings.length ? `<div class="note warn" style="margin-top: 0.6rem;"><ul style="margin-left: 1rem;">${warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>` : '<div class="note" style="margin-top: 0.6rem;">✓ Every deliverable has one Accountable owner and someone Responsible.</div>'}</div>`;
            }
            return {
                sub: `${P.members.length} people · assign work from any item`,
                html: `<form class="card team-add" data-form="memberAdd" style="margin-bottom: 1rem;">
                        <div class="field"><label for="mName">Name</label><input class="input" id="mName" name="name" required maxlength="40" placeholder="Full name"></div>
                        <div class="field"><label for="mRole">Role</label><input class="input" id="mRole" name="role" maxlength="40" placeholder="e.g. Developer"></div>
                        <div class="field"><label for="mEmail">Email</label><input class="input" type="email" id="mEmail" name="email" maxlength="120" placeholder="name@company.com"></div>
                        <button class="btn btn-primary" type="submit">＋ Add person</button>
                    </form>
                    <div class="table-wrap"><table class="tbl team-tbl"><thead><tr><th>Person</th><th>Role</th><th>Email</th><th>Work</th><th>Access</th><th></th></tr></thead><tbody>
                    ${P.members.map(m => {
                        const mine = A.work().filter(i => i.assigneeId === m.id);
                        const access = PMT.cloud ? accessCell(m) : m.invite === 'pending' ? '<span class="pill doing">Invite pending</span>' : `<button class="btn btn-ghost btn-sm" data-act="memberInvite" data-id="${m.id}">✉ Invite</button>`;
                        return `<tr><td><span style="display: flex; gap: 0.5rem; align-items: center;">${avatar(m)}<input class="input" value="${esc(m.name)}" data-change="memberName" data-id="${m.id}" aria-label="Name"></span></td>
                            <td><input class="input" value="${esc(m.role)}" data-change="memberRole" data-id="${m.id}" aria-label="Role for ${esc(m.name)}"></td>
                            <td><input class="input" type="email" value="${esc(m.email || '')}" placeholder="Add email" data-change="memberEmail" data-id="${m.id}" aria-label="Email for ${esc(m.name)}"></td>
                            <td class="small" style="white-space: nowrap;">${mine.filter(i => i.status !== 'done').length} open · ${mine.filter(i => i.status === 'done').length} done</td>
                            <td>${access}</td>
                            <td><button class="icon-btn" data-act="memberRemove" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">✕</button></td></tr>`;
                    }).join('')}</tbody></table></div>
                    ${PMT.cloud ? accessCard() : '<p class="muted small" style="margin-top: 0.5rem;">Emails are stored with the project. Invitations and sign-in work when the Project Tool runs on the PM Ready server.</p>'}
                    ${raciHtml}`
            };
        },
        mount() {
            if (!PMT.cloud) return;
            const c = A.accessCache;
            if (!c || c.projectId !== A.P.id || Date.now() - c.at > 30000) loadAccess();
        }
    });

    // ─── Who can open the project (server mode) ───
    const ROLES = () => PMT.ROLE_LABELS;
    const canManage = () => A.meta && ['owner', 'manager'].includes(A.meta.role);
    const grantable = () => ['manager', 'member', 'viewer'];
    async function loadAccess() {
        try {
            const r = await PMT.store.access.list(A.P.id);
            A.accessCache = { projectId: A.P.id, at: Date.now(), people: r.people };
        } catch (e) {
            A.accessCache = { projectId: A.P.id, at: Date.now(), people: [], error: e.userMessage || 'Could not load who has access.' };
        }
        if (A.view === 'team') A.render();
    }
    const accessFor = email => email && (A.accessCache?.people || []).find(x => x.email === email.trim().toLowerCase());
    function accessCell(m) {
        if (!A.accessCache) return '<span class="muted small">…</span>';
        const a = accessFor(m.email);
        if (a) return `<span class="pill ${a.status === 'pending' ? 'doing' : 'done'}" title="${esc(PMT.ROLE_HELP[a.role])}">${ROLES()[a.role]}${a.status === 'pending' ? ' · invited' : ''}</span>`;
        if (!m.email) return '<span class="muted small">Add an email to give access</span>';
        if (/@example\.com$/i.test(m.email)) return '<span class="muted small">Replace the example email</span>';
        return canManage() ? `<button class="btn btn-ghost btn-sm" data-act="memberGrant" data-id="${m.id}">🔑 Give access</button>` : '<span class="muted small">No access</span>';
    }
    function accessCard() {
        const c = A.accessCache;
        if (!c) return '<div class="card" style="margin-top: 1rem;"><p class="muted">Loading who has access…</p></div>';
        const mine = A.meta.role, manage = canManage();
        const roleSelect = (a) => manage && a.role !== 'owner' && !(a.role === 'manager' && mine !== 'owner')
            ? `<select class="select" data-change="accessRole" data-aid="${a.id}" aria-label="Access for ${esc(a.email)}">${grantable().map(r => `<option value="${r}" ${a.role === r ? 'selected' : ''}>${ROLES()[r]}</option>`).join('')}</select>`
            : `<span class="pill">${ROLES()[a.role]}</span>`;
        const rowActions = a => {
            const out = [];
            if (mine === 'owner' && a.role !== 'owner' && a.status === 'active') out.push(`<button class="btn btn-ghost btn-sm" data-act="accessTransfer" data-aid="${a.id}">Make owner</button>`);
            if (manage && a.status === 'pending') out.push(`<button class="btn btn-ghost btn-sm" data-act="accessResend" data-aid="${a.id}">✉ Resend</button>`);
            if (a.isYou && a.role !== 'owner') out.push(`<button class="btn btn-ghost btn-sm" data-act="accessLeave" data-aid="${a.id}">Leave</button>`);
            else if (manage && a.role !== 'owner' && !(a.role === 'manager' && mine !== 'owner')) out.push(`<button class="icon-btn" data-act="accessRemove" data-aid="${a.id}" aria-label="Remove access for ${esc(a.email)}">✕</button>`);
            return out.join(' ');
        };
        return `<div class="card" style="margin-top: 1rem;">
            <h3>🔑 Who can open this project</h3>
            <p class="muted small" style="margin-bottom: 0.7rem;">${Object.entries(PMT.ROLE_HELP).map(([k, v]) => `<strong>${ROLES()[k]}</strong>: ${v.toLowerCase()}`).join(' · ')}.${A.meta.companyName ? ` Owners and admins of ${esc(A.meta.companyName)} can also manage it.` : ''}</p>
            ${c.error ? `<p class="note warn">${esc(c.error)}</p>` : ''}
            <div class="table-wrap"><table class="tbl access-tbl"><thead><tr><th>Person</th><th>Email</th><th>Access</th><th>Status</th><th></th></tr></thead><tbody>
            ${c.people.map(a => `<tr><td><span style="display: inline-flex; gap: 0.5rem; align-items: center;">${PMAccount.avatarHtml(a, 26)}${esc(a.name || (P => P ? P.name : '—')(A.P.members.find(m => (m.email || '').toLowerCase() === a.email)))}${a.isYou ? ' <span class="pill">You</span>' : ''}</span></td><td>${esc(a.email)}</td><td>${roleSelect(a)}</td>
                <td>${a.status === 'pending' ? '<span class="pill doing">Invited by email</span>' : '<span class="pill done">Active</span>'}</td><td style="white-space: nowrap;">${rowActions(a)}</td></tr>`).join('')}
            </tbody></table></div>
            ${manage ? `<form class="team-add" data-form="accessAdd" style="margin-top: 0.8rem;">
                <div class="field"><label for="acEmail">Give access by email</label><input class="input" type="email" id="acEmail" name="email" required maxlength="200" placeholder="name@company.com"></div>
                <div class="field"><label for="acRole">Access</label><select class="select" id="acRole" name="role">${grantable().map(r => `<option value="${r}" ${r === 'member' ? 'selected' : ''}>${ROLES()[r]}</option>`).join('')}</select></div>
                <button class="btn btn-primary" type="submit">Give access</button></form>
                <p class="muted small" style="margin-top: 0.4rem;">Everyone gets an email: people with an account are added straight away; others get an invitation link to create their account, and their access starts when they do.</p>` : ''}
        </div>`;
    }
    async function accessDo(fn, okMsg) {
        try { const r = await fn(); if (r && r.people) A.accessCache = { projectId: A.P.id, at: Date.now(), people: r.people }; if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good'); A.render(); return r; }
        catch (e) { toast(e.userMessage || 'Something went wrong.', 'bad'); return null; }
    }
    A.action('memberGrant', el => {
        const m = A.member(el.dataset.id);
        accessDo(() => PMT.store.access.add(A.P.id, { email: m.email, role: 'member', memberId: m.id }), r => !r.emailed ? `${m.name} added, but the email could not be sent` : r.pending ? `Invitation emailed to ${m.email}` : `${m.name} can now open this project (emailed)`);
    });
    A.action('accessAdd', async (form, v) => {
        const email = v.email.trim().toLowerCase();
        if (!EMAIL.test(email)) return toast('That email address doesn\'t look right.', 'warn');
        const member = A.P.members.find(m => (m.email || '').toLowerCase() === email);
        const r = await accessDo(() => PMT.store.access.add(A.P.id, { email, role: v.role, memberId: member?.id }), r => !r.emailed ? `${email} added, but the email could not be sent` : r.pending ? `Invitation emailed to ${email}` : `${r.name || email} can now open this project (emailed)`);
        // Also put them on the team so work can be assigned to them
        if (r && !member) {
            const name = r.name || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
            A.P.members.push({ id: PMT.uid('m_'), name, role: 'Team member', email });
            A.commit(`Added ${name} to the team`);
        }
        document.getElementById('acEmail')?.focus();
    });
    A.action('accessResend', el => accessDo(() => PMT.store.access.resend(A.P.id, el.dataset.aid), 'Invitation sent again'));
    A.action('accessRole', el => accessDo(() => PMT.store.access.update(A.P.id, el.dataset.aid, { role: el.value }), 'Access updated'));
    A.action('accessRemove', el => {
        const a = A.accessCache.people.find(x => x.id === el.dataset.aid);
        if (!confirm(`Remove ${a.email}'s access? They stay on the team list; they just can't open the project.`)) return;
        accessDo(async () => { await PMT.store.access.remove(A.P.id, a.id); return PMT.store.access.list(A.P.id); }, 'Access removed');
    });
    A.action('accessTransfer', el => {
        const a = A.accessCache.people.find(x => x.id === el.dataset.aid);
        if (!confirm(`Make ${a.name || a.email} the owner? You become a manager.`)) return;
        accessDo(() => PMT.store.access.transfer(A.P.id, a.id), `${a.name || a.email} is now the owner`).then(r => { if (r) { A.meta.role = 'manager'; A.render(); } });
    });
    A.action('accessLeave', async el => {
        if (!confirm('Leave this project? You won\'t be able to open it unless someone adds you again.')) return;
        try { await PMT.store.access.remove(A.P.id, el.dataset.aid); location.href = 'index.html'; }
        catch (e) { toast(e.userMessage || 'Could not leave.', 'bad'); }
    });
    A.action('memberAdd', (form, v) => {
        const name = v.name.trim();
        if (!name) return;
        const email = (v.email || '').trim();
        if (email && !EMAIL.test(email)) return toast('That email address doesn\'t look right.', 'warn');
        A.P.members.push({ id: PMT.uid('m_'), name, role: v.role.trim() || 'Team member', email });
        A.commit(`Added ${name} to the team`, `Added ${name}`, 'good');
        document.getElementById('mName')?.focus();
    });
    A.action('memberName', el => { const m = A.member(el.dataset.id); if (el.value.trim()) { m.name = el.value.trim(); A.commit(); } });
    A.action('memberRole', el => { const m = A.member(el.dataset.id); m.role = el.value.trim() || 'Team member'; A.commit(); });
    A.action('memberEmail', el => {
        const m = A.member(el.dataset.id), email = el.value.trim();
        if (email && !EMAIL.test(email)) { toast('That email address doesn\'t look right.', 'warn'); el.value = m.email || ''; return; }
        m.email = email;
        if (!email) delete m.invite;
        A.commit(`Updated email for ${m.name}`);
    });
    // Placeholder until accounts exist: records the request so it can be sent later
    A.action('memberInvite', el => {
        const m = A.member(el.dataset.id);
        if (!m.email) { toast(`Add an email for ${m.name} first.`, 'warn'); document.querySelector(`[data-change="memberEmail"][data-id="${m.id}"]`)?.focus(); return; }
        m.invite = 'pending';
        A.commit(`Invite requested for ${m.name} (${m.email})`, `Saved. Invites will be sent when accounts are set up.`, 'good');
    });
    A.action('memberRemove', el => {
        const m = A.member(el.dataset.id);
        const open = A.work().filter(i => i.assigneeId === m.id && i.status !== 'done').length;
        if (!confirm(`Remove ${m.name} from the team?${open ? ` Their ${open} open item(s) become unassigned.` : ''}`)) return;
        A.work().forEach(i => { if (i.assigneeId === m.id) i.assigneeId = null; });
        A.groups().forEach(g => { if (g.raci) delete g.raci[m.id]; });
        A.P.risks.forEach(r => { if (r.ownerId === m.id) r.ownerId = null; });
        A.P.members = A.P.members.filter(x => x !== m);
        A.commit(`Removed ${m.name} from the team`);
    });
    A.action('raci', el => {
        const g = A.item(el.dataset.id);
        g.raci = g.raci || {};
        const next = RACI[(RACI.indexOf(g.raci[el.dataset.m] || '') + 1) % RACI.length];
        if (next) g.raci[el.dataset.m] = next; else delete g.raci[el.dataset.m];
        A.commit();
    });

    // ══════════════════════════ Change requests ══════════════════════════
    const LEVELS = ['None', 'Low', 'Medium', 'High'];
    A.register('changes', {
        render() {
            const P = A.P;
            const order = { proposed: 0, approved: 1, rejected: 2 };
            const list = P.changes.slice().sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
            return {
                sub: 'Every change to the agreed plan is assessed and approved before work starts',
                html: `<div class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); align-items: start;">
                    <div>${list.length ? list.map(c => `<div class="card" style="margin-bottom: 0.7rem; border-left: 4px solid ${c.status === 'approved' ? 'var(--ok)' : c.status === 'rejected' ? 'var(--muted)' : 'var(--gold)'};">
                        <div style="display: flex; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap;"><strong>${esc(c.title)}</strong><span class="pill ${c.status === 'approved' ? 'done' : c.status === 'rejected' ? '' : 'doing'}">${c.status[0].toUpperCase() + c.status.slice(1)}</span></div>
                        ${c.reason ? `<p class="small" style="margin-top: 0.3rem;">${esc(c.reason)}</p>` : ''}
                        <p class="small muted" style="margin-top: 0.3rem;">Impact: scope ${LEVELS[c.scope] || 'None'} · schedule ${LEVELS[c.schedule] || 'None'} · cost ${LEVELS[c.cost] || 'None'} · requested by ${esc(A.member(c.requestedBy)?.name || 'someone')} · ${new Date(c.createdAt).toLocaleDateString()}</p>
                        ${c.decisionNote ? `<p class="small" style="margin-top: 0.3rem;"><strong>Decision:</strong> ${esc(c.decisionNote)}</p>` : ''}
                        <div class="toolbar" style="margin-top: 0.6rem;">
                            ${c.status === 'proposed' ? `<button class="btn btn-primary btn-sm" data-act="crDecide" data-id="${c.id}" data-to="approved">Approve</button><button class="btn btn-ghost btn-sm" data-act="crDecide" data-id="${c.id}" data-to="rejected">Reject</button>` : ''}
                            ${c.status === 'approved' && !c.itemId ? `<button class="btn btn-ghost btn-sm" data-act="crToItem" data-id="${c.id}">＋ Create work item from this change</button>` : ''}
                            ${c.itemId && A.item(c.itemId) ? `<button class="btn btn-ghost btn-sm" data-act="openItem" data-id="${c.itemId}">Open linked item</button>` : ''}
                        </div></div>`).join('') : '<div class="card empty"><div class="big">📝</div><h3>No change requests</h3><p>When someone asks to change scope, dates, or budget, log it here so it can be assessed and decided.</p></div>'}</div>
                    <form class="card" data-form="crAdd"><h3>Request a change</h3>
                        <div class="field"><label for="crTitle">What should change?</label><input class="input" id="crTitle" name="title" required maxlength="120"></div>
                        <div class="field"><label for="crReason">Why?</label><textarea class="textarea" id="crReason" name="reason" maxlength="600"></textarea></div>
                        <div class="row">${['scope', 'schedule', 'cost'].map(k => `<div class="field"><label for="cr-${k}">Impact on ${k}</label><select class="select" id="cr-${k}" name="${k}">${LEVELS.map((l, n) => `<option value="${n}">${l}</option>`).join('')}</select></div>`).join('')}</div>
                        <div class="field"><label for="crBy">Requested by</label><select class="select" id="crBy" name="requestedBy">${memberOptions('', 'Someone outside the team')}</select></div>
                        <button class="btn btn-primary" type="submit">Submit for approval</button>
                    </form></div>`
            };
        }
    });
    A.action('crAdd', (form, v) => {
        if (!v.title.trim()) return;
        A.P.changes.push({ id: PMT.uid('cr_'), title: v.title.trim(), reason: v.reason.trim(), scope: Number(v.scope), schedule: Number(v.schedule), cost: Number(v.cost), requestedBy: v.requestedBy || null, status: 'proposed', createdAt: new Date().toISOString() });
        A.commit(`Change requested: "${v.title.trim()}"`, 'Change request submitted', 'good');
    });
    A.action('crDecide', el => {
        const c = A.P.changes.find(x => x.id === el.dataset.id);
        const note = prompt(el.dataset.to === 'approved' ? 'Approval note (optional)' : 'Why is it rejected? (shared with the requester)');
        if (note === null) return;
        c.status = el.dataset.to;
        c.decisionNote = note.trim();
        c.decidedAt = new Date().toISOString();
        A.commit(`Change "${c.title}" ${c.status}`, c.status === 'approved' ? 'Approved. Create the work item and re-baseline milestones if dates moved.' : 'Rejected', c.status === 'approved' ? 'good' : '');
    });
    A.action('crToItem', el => {
        const c = A.P.changes.find(x => x.id === el.dataset.id);
        const it = A.newItem({ title: c.title, description: `From approved change request.${c.reason ? ' ' + c.reason : ''}`, duration: A.F.schedule ? 1 : null });
        A.P.items.push(it);
        c.itemId = it.id;
        A.commit(`Created work item from change "${c.title}"`);
        A.openItem(it.id);
    });

    // ══════════════════════════ Risks ══════════════════════════
    const scoreClass = s => s >= 15 ? 'crit' : s >= 8 ? 'doing' : 'done';
    A.register('risks', {
        render() {
            const P = A.P;
            const open = P.risks.filter(r => r.status === 'open');
            const list = P.risks.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.probability * b.impact - a.probability * a.impact);
            const heat = [5, 4, 3, 2, 1].map(pr => `<div class="ax">${pr}</div>` + [1, 2, 3, 4, 5].map(im => {
                const n = open.filter(r => r.probability === pr && r.impact === im).length;
                const s = pr * im;
                return `<div style="background:${s >= 15 ? '#F8C9C9' : s >= 8 ? '#FBE3B4' : '#CFEFDF'}" title="Probability ${pr}, impact ${im}">${n || ''}</div>`;
            }).join('')).join('') + `<div class="ax"></div>${[1, 2, 3, 4, 5].map(i => `<div class="ax">${i}</div>`).join('')}`;
            return {
                sub: `${open.length} open · score = probability × impact (1–25)`,
                html: `<div class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); align-items: start;">
                    <div>${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Risk</th><th>Score</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>
                        ${list.map(r => `<tr style="${r.status === 'closed' ? 'opacity: 0.6;' : ''}"><td><strong>${esc(r.title)}</strong>${r.response ? `<div class="muted small">Response: ${esc(r.response)}</div>` : ''}</td>
                            <td><span class="pill ${scoreClass(r.probability * r.impact)}" title="P${r.probability} × I${r.impact}">${r.probability * r.impact}</span></td>
                            <td><select class="select" style="min-width: 130px;" data-change="riskOwner" data-id="${r.id}" aria-label="Owner of ${esc(r.title)}">${memberOptions(r.ownerId, 'No owner')}</select></td>
                            <td><button class="btn btn-ghost btn-sm" data-act="riskToggle" data-id="${r.id}">${r.status === 'open' ? 'Close' : 'Reopen'}</button></td>
                            <td><button class="icon-btn" data-act="riskDelete" data-id="${r.id}" aria-label="Delete ${esc(r.title)}">✕</button></td></tr>`).join('')}</tbody></table></div>`
                        : '<div class="card empty"><div class="big">⚠️</div><h3>No risks logged</h3><p>What could go wrong, or unexpectedly well? Log it with an owner and a response.</p></div>'}</div>
                    <div class="grid">
                        <div class="card"><h3>Heat map (open risks)</h3><div class="heat" aria-label="Probability by impact">${heat}</div><p class="muted small" style="margin-top: 0.4rem;">Rows: probability · Columns: impact</p></div>
                        <form class="card" data-form="riskAdd"><h3>Add a risk</h3>
                            <div class="field"><label for="rTitle">Risk</label><input class="input" id="rTitle" name="title" required maxlength="140" placeholder="e.g. Supplier delivers late"></div>
                            <div class="row"><div class="field"><label for="rP">Probability (1–5)</label><select class="select" id="rP" name="probability">${[1, 2, 3, 4, 5].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
                                <div class="field"><label for="rI">Impact (1–5)</label><select class="select" id="rI" name="impact">${[1, 2, 3, 4, 5].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
                            <div class="field"><label for="rOwner">Owner</label><select class="select" id="rOwner" name="ownerId">${memberOptions('', 'No owner')}</select></div>
                            <div class="field"><label for="rResp">Response plan</label><input class="input" id="rResp" name="response" maxlength="200" placeholder="Avoid, reduce, transfer, or accept: how?"></div>
                            <button class="btn btn-primary" type="submit">Add risk</button></form>
                    </div></div>`
            };
        }
    });
    A.action('riskAdd', (form, v) => {
        if (!v.title.trim()) return;
        A.P.risks.push({ id: PMT.uid('r_'), title: v.title.trim(), probability: Number(v.probability), impact: Number(v.impact), ownerId: v.ownerId || null, response: v.response.trim(), status: 'open', createdAt: new Date().toISOString() });
        A.commit(`Logged risk "${v.title.trim()}"`, 'Risk added', 'good');
    });
    A.action('riskOwner', el => { A.P.risks.find(r => r.id === el.dataset.id).ownerId = el.value || null; A.commit(); });
    A.action('riskToggle', el => { const r = A.P.risks.find(x => x.id === el.dataset.id); r.status = r.status === 'open' ? 'closed' : 'open'; A.commit(`Risk "${r.title}" ${r.status}`); });
    A.action('riskDelete', el => { const r = A.P.risks.find(x => x.id === el.dataset.id); if (!confirm(`Delete risk "${r.title}"?`)) return; A.P.risks = A.P.risks.filter(x => x !== r); A.commit(`Deleted risk "${r.title}"`); });

    // ══════════════════════════ Settings ══════════════════════════
    let pendingMethod = null;
    A.register('settings', {
        render() {
            const P = A.P, F = A.F;
            pendingMethod = null;
            return {
                sub: 'Project details, tools, working rules, and methodology',
                html: `<div class="grid grid-2" style="align-items: start;">
                    <form class="card" data-form="settingsSave"><h3>Project details</h3>
                        <div class="field"><label for="sName">Name</label><input class="input" id="sName" name="name" required maxlength="80" value="${esc(P.name)}"></div>
                        <div class="field"><label for="sDesc">Description</label><textarea class="textarea" id="sDesc" name="description" maxlength="300">${esc(P.description)}</textarea></div>
                        <div class="row">
                            <div class="field"><label for="sStart">Start date</label><input class="input" type="date" id="sStart" name="startDate" value="${P.startDate}"></div>
                            ${F.iterations ? `<div class="field"><label for="sLen">${F.iterName} length (working days)</label><input class="input" type="number" min="1" max="30" id="sLen" name="iterationDays" value="${P.settings.iterationDays}"><span class="hint">Applies to ${F.iterName.toLowerCase()}s planned from now on.</span></div>` : ''}
                            ${F.flow ? `<div class="field"><label for="sWip">Work-in-progress limit</label><input class="input" type="number" min="1" max="50" id="sWip" name="wipLimit" value="${P.settings.wipLimit}"></div>` : ''}
                        </div>
                        <button class="btn btn-primary" type="submit">Save details</button></form>
                    <div class="card"><h3>Data</h3>
                        <p class="small muted" style="margin-bottom: 0.8rem;">This project is saved in this browser only. Export it to back it up or open it on another device (Import on the projects page).</p>
                        <div class="toolbar"><button class="btn btn-ghost" data-act="exportProject">⬇ Export (.json)</button><button class="btn btn-danger" data-act="deleteProject">Delete project</button></div></div>
                    <div class="card" style="grid-column: 1 / -1;"><h3>Tools</h3>
                        <p class="small muted" style="margin-bottom: 0.8rem;">Add any project management tool to this project, whatever the methodology. Tools that come with <strong>${esc(PMT.methodName(P.method))}</strong> are always on. Switching a tool off hides it; its data is kept.</p>
                        <div id="toolPicker"></div></div>
                    <div class="card" style="grid-column: 1 / -1;"><h3>Methodology</h3>
                        <p class="small muted" style="margin-bottom: 0.8rem;">Currently: <strong>${PMT.methodIcon(P.method)} ${esc(PMT.methodName(P.method))}</strong>. You can switch at any time; all work items, people, milestones, and history are kept. Only the screens and rules change.</p>
                        <div id="methodPicker"></div>
                        <div class="toolbar" style="margin-top: 1rem;"><button class="btn btn-primary" data-act="applyMethod" id="applyMethod" disabled>Apply methodology</button><span class="small muted" id="methodHint">Choose a different option to switch.</span></div></div>
                </div>`
            };
        },
        mount() {
            PMT.renderToolPicker(document.getElementById('toolPicker'), A.P.method, A.P.settings.tools, tools => {
                const before = A.F.tools;
                A.P.settings.tools = tools;
                A.refreshFeatures();
                A.fillForFeatures();
                const added = Object.keys(PMT.TOOLS).filter(k => A.F.tools[k] && !before[k]);
                const removed = Object.keys(PMT.TOOLS).filter(k => !A.F.tools[k] && before[k]);
                const names = ks => ks.map(k => PMT.TOOLS[k].label).join(', ');
                A.commit(added.length ? `Added ${names(added)}` : removed.length ? `Removed ${names(removed)}` : null,
                    added.length ? `Added ${names(added)}. Find it in the sidebar.` : removed.length ? `Hid ${names(removed)}` : null, added.length ? 'good' : '');
            });
            PMT.renderMethodPicker(document.getElementById('methodPicker'), A.P.method, v => {
                pendingMethod = v;
                const changed = JSON.stringify(v) !== JSON.stringify(A.P.method);
                document.getElementById('applyMethod').disabled = !changed;
                document.getElementById('methodHint').textContent = changed ? `Switch to ${PMT.methodName(v)}.` : 'Choose a different option to switch.';
            });
        }
    });
    A.action('settingsSave', (form, v) => {
        const P = A.P;
        if (!v.name.trim()) return toast('The project needs a name.', 'warn');
        P.name = v.name.trim();
        P.description = v.description.trim();
        if (v.startDate) P.startDate = D.nextWorkday(v.startDate);
        if (v.iterationDays) P.settings.iterationDays = Math.max(1, Math.min(30, Number(v.iterationDays)));
        if (v.wipLimit) P.settings.wipLimit = Math.max(1, Math.min(50, Number(v.wipLimit)));
        document.title = `${P.name} - PM Ready Project Tool`;
        A.commit('Updated project details', 'Saved', 'good');
    });
    A.action('applyMethod', () => {
        if (!pendingMethod) return;
        const from = PMT.methodName(A.P.method), to = PMT.methodName(pendingMethod);
        if (!confirm(`Switch from ${from} to ${to}? Your data is kept; the screens and rules change.`)) return;
        const P = A.P;
        P.method = pendingMethod;
        A.refreshFeatures();
        A.fillForFeatures();
        A.commit(`Methodology changed from ${from} to ${to}`, `Now using ${to}`, 'good');
    });
    A.action('exportProject', () => {
        const safe = A.P.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
        PMT.ui.download(`${safe}.pmready.json`, JSON.stringify(A.P, null, 2));
        toast('Exported', 'good');
    });
    A.action('deleteProject', async () => {
        if (!confirm(`Delete "${A.P.name}" permanently? Export it first if you might need it.`)) return;
        try { await PMT.store.remove(A.P.id); }
        catch (e) { toast(e.userMessage || 'Could not delete the project.', 'bad'); return; }
        location.href = 'index.html';
    });
})();
