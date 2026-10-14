/* View: Timeline. Sprints, milestones, and deliverables/epics on the calendar. */
(function () {
    const A = PMT.app;
    const { esc, STATUS } = PMT.ui;
    const D = PMT.dates;
    const DAY = 86400000;
    const pts = items => items.reduce((s, i) => s + (Number(i.estimate) || 0), 0);
    const daysBetween = (a, b) => Math.round((D.toDate(b) - D.toDate(a)) / DAY);
    const addDays = (iso, n) => D.toISO(new Date(D.toDate(iso).getTime() + n * DAY));
    const mondayOf = iso => { const d = D.toDate(iso); const w = (d.getUTCDay() + 6) % 7; return addDays(iso, -w); };

    A.register('timeline', {
        render() {
            const P = A.P, F = A.F;
            const iters = P.iterations.slice().sort((a, b) => a.start.localeCompare(b.start));
            const sched = F.schedule ? PMT.schedule.buildSchedule(P) : null;
            const today = D.todayISO();
            const msWithDates = P.milestones.filter(m => m.targetDate);

            // What each deliverable/epic spans: its sprints, or its scheduled work
            const spanOf = items => {
                if (F.iterations) {
                    const its = [...new Set(items.map(i => i.iterationId).filter(Boolean))].map(id => iters.find(x => x.id === id)).filter(Boolean);
                    if (its.length) return { start: its.map(x => x.start).sort()[0], end: its.map(x => x.end).sort().slice(-1)[0], via: `${its.length} ${F.iterName.toLowerCase()}${its.length > 1 ? 's' : ''}` };
                }
                if (sched) {
                    const s = items.filter(i => sched.byId[i.id]);
                    if (s.length) return { start: s.map(i => sched.byId[i.id].startDate).sort()[0], end: s.map(i => sched.byId[i.id].endDate).sort().slice(-1)[0], via: 'schedule' };
                }
                return null;
            };
            const lanes = A.groups().map(g => ({ g, items: A.childrenOf(g.id) }))
                .concat([{ g: null, items: A.work().filter(i => !i.parentId || !A.item(i.parentId)) }])
                .filter(l => l.items.length)
                .map(l => ({ ...l, span: spanOf(l.items) }));

            const dates = [P.startDate, today, ...iters.flatMap(i => [i.start, i.end]), ...msWithDates.map(m => m.targetDate), ...(sched ? [sched.finishDate] : [])];
            const start = mondayOf(dates.slice().sort()[0]);
            let end = addDays(dates.slice().sort().slice(-1)[0], 14);
            if (daysBetween(start, end) < 56) end = addDays(start, 56);
            const W = 15, total = daysBetween(start, end) + 1, trackW = total * W;
            const x = iso => daysBetween(start, iso) * W;

            const planButtons = F.iterations ? `<button class="btn btn-ghost" data-act="tlPlan" data-n="1">＋ Plan next ${F.iterName.toLowerCase()}</button><button class="btn btn-primary" data-act="tlPlan" data-n="3">＋ Plan 3 ${F.iterName.toLowerCase()}s ahead</button>` : '';
            if (!iters.length && !msWithDates.length && !lanes.some(l => l.span)) {
                return {
                    sub: 'Your project on the calendar',
                    html: `<div class="card empty"><div class="big">🗓️</div><h3>Nothing on the timeline yet</h3>
                        <p>${F.iterations ? `Plan ${F.iterName.toLowerCase()}s to lay them out on the calendar.` : 'Add milestones with target dates, or switch on Sprints or the Gantt chart in Settings → Tools.'}</p>
                        <div class="toolbar" style="justify-content: center; margin-top: 0.9rem;">${planButtons || '<a class="btn btn-primary" href="#settings">Open Settings → Tools</a>'}</div></div>`
                };
            }

            const ticks = [];
            for (let d = start; d <= end; d = addDays(d, 7)) ticks.push(`<span class="g-tick" style="left:${x(d)}px">${D.fmt(d)}</span>`);
            const weekLines = `background-image: linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: ${7 * W}px 100%;`;
            const todayLine = today >= start && today <= end ? `<span class="g-today" style="left:${x(today) + W / 2}px" title="Today"></span>` : '';
            const row = (label, inner, cls = '', h) => `<div class="g-row ${cls}" ${h ? `style="height:${h}px"` : ''}><div class="g-label">${label}</div><div class="g-track" style="width:${trackW}px; ${weekLines}">${inner}${todayLine}</div></div>`;

            let rows = row('Week of', ticks.join(''), 'g-head');
            if (F.iterations) {
                rows += row(`<strong>🔁 ${esc(F.iterName)}s</strong>`, iters.map(it => {
                    const items = A.work().filter(i => i.iterationId === it.id);
                    const p = it.status === 'closed' ? `${it.velocity ?? 0}/${it.committed ?? 0} pt` : `${pts(items)} pt`;
                    return `<button class="tl-sprint ${it.status}" style="left:${x(it.start)}px; width:${(daysBetween(it.start, it.end) + 1) * W - 3}px" data-act="tlIteration" data-id="${it.id}"
                        title="${esc(it.name)} · ${D.fmt(it.start)} – ${D.fmt(it.end)} · ${it.status}${it.goal ? ` · Goal: ${esc(it.goal)}` : ''} · ${p}">${esc(it.name)} <span>${p}</span></button>`;
                }).join('') || `<span class="muted small" style="position: absolute; left: 8px; top: 10px;">No ${F.iterName.toLowerCase()}s yet</span>`, 'g-group', 46);
            }
            if (msWithDates.length) {
                rows += row('<strong>🏁 Milestones</strong>', msWithDates.map(m => {
                    const items = m.itemIds.map(A.item).filter(Boolean);
                    const reached = items.length && items.every(i => i.status === 'done');
                    const f = sched ? PMT.schedule.milestoneForecast(P, m, sched) : null;
                    const late = !reached && ((f && f > m.targetDate) || m.targetDate < today);
                    return `<span class="tl-ms ${reached ? 'reached' : late ? 'late' : ''}" style="left:${x(m.targetDate) + W / 2}px" title="${esc(m.name)}: target ${D.fmt(m.targetDate)}${f ? `, forecast ${D.fmt(f)}` : ''}${reached ? ' · reached' : late ? ' · at risk' : ''}"><i></i><b>${esc(m.name)}</b></span>`;
                }).join(''), '', 46);
            }
            lanes.forEach(l => {
                const doneN = l.items.filter(i => i.status === 'done').length;
                const unplanned = F.iterations ? l.items.filter(i => !i.iterationId && i.status !== 'done').length : 0;
                const label = `${l.g ? `${A.code(l.g) ? `<span class="mono muted">${A.code(l.g)}</span>` : ''}<button data-act="openItem" data-id="${l.g.id}">${esc(l.g.title)}</button>` : '<span class="muted">Other work</span>'}`;
                const inner = l.span
                    ? `<span class="tl-bar" style="left:${x(l.span.start)}px; width:${(daysBetween(l.span.start, l.span.end) + 1) * W - 3}px" title="${doneN}/${l.items.length} done · from ${l.span.via}"><span class="tl-fill" style="width:${doneN / l.items.length * 100}%"></span><span class="tl-txt">${doneN}/${l.items.length}</span></span>${unplanned ? `<span class="tl-note" style="left:${x(l.span.end) + W + 4}px">+${unplanned} unplanned</span>` : ''}`
                    : `<span class="muted small" style="position: absolute; left: 8px; top: 10px;">${l.items.length} item${l.items.length > 1 ? 's' : ''}, not ${F.iterations ? `in a ${F.iterName.toLowerCase()}` : 'scheduled'} yet</span>`;
                rows += row(label, inner);
            });

            // Sprint cards under the timeline: what is in each one
            const cards = F.iterations && iters.length ? `<h3 style="margin: 1.4rem 0 0.7rem;">${esc(F.iterName)}s in order</h3>
                <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));">${iters.map(it => {
                    const items = A.ranked().filter(i => i.iterationId === it.id);
                    return `<div class="card tl-card ${it.status}">
                        <div style="display: flex; justify-content: space-between; gap: 0.5rem;"><strong>${esc(it.name)}</strong><span class="pill ${it.status === 'active' ? 'doing' : it.status === 'closed' ? 'done' : 'todo'}">${it.status === 'active' ? 'Active' : it.status === 'closed' ? 'Done' : 'Planned'}</span></div>
                        <div class="muted small">${D.fmt(it.start)} – ${D.fmt(it.end)}${it.status === 'closed' ? ` · velocity ${it.velocity ?? 0}` : ` · ${pts(items)} pt`}</div>
                        ${it.goal ? `<p class="small" style="margin-top: 0.3rem;">🎯 ${esc(it.goal)}</p>` : ''}
                        <div style="margin-top: 0.5rem;">${items.slice(0, 6).map(i => `<div class="small" style="display: flex; justify-content: space-between; gap: 0.4rem; padding: 0.15rem 0;"><span>${esc(i.title)}</span><span class="pill ${i.status}">${STATUS[i.status]}</span></div>`).join('') || `<p class="muted small">${it.status === 'planned' ? 'No items yet.' : 'No items.'}</p>`}${items.length > 6 ? `<p class="muted small">+${items.length - 6} more</p>` : ''}</div>
                        ${it.status === 'planned' ? `<button class="btn btn-ghost btn-sm" style="margin-top: 0.5rem;" data-act="tlIteration" data-id="${it.id}">Plan this ${F.iterName.toLowerCase()} →</button>` : ''}
                    </div>`;
                }).join('')}</div>` : '';

            const lastIt = iters[iters.length - 1];
            return {
                sub: F.iterations && iters.length ? `${iters.length} ${F.iterName.toLowerCase()}${iters.length > 1 ? 's' : ''} · ${D.fmt(iters[0].start)} → ${D.fmt(lastIt.end, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Your project on the calendar',
                html: `<div class="view-head"><div class="toolbar small muted" style="gap: 1rem;">
                        ${F.iterations ? '<span><span class="tl-key closed"></span> Done</span><span><span class="tl-key active"></span> Active</span><span><span class="tl-key planned"></span> Planned</span>' : ''}
                        <span>◆ Milestone</span><span style="color: var(--coral); font-weight: 700;">| Today</span></div>
                        <div class="toolbar">${planButtons}</div></div>
                    <div class="gantt-wrap"><div class="gantt" style="width: calc(240px + ${trackW}px)">${rows}</div></div>
                    ${F.iterations && iters.length ? '<p class="muted small" style="margin-top: 0.5rem;">Click a sprint to plan or review it. Deliverable/epic bars span the sprints that contain their work.</p>' : ''}
                    ${cards}`
            };
        }
    });

    A.action('tlPlan', el => {
        const n = Number(el.dataset.n) || 1;
        const made = [];
        for (let k = 0; k < n; k++) made.push(A.createIteration());
        A.state.planIterId = made[0].id;
        A.commit(`Planned ${made.map(m => m.name).join(', ')} on the timeline`, `Added ${made.map(m => m.name).join(', ')}`, 'good');
    });
    A.action('tlIteration', el => {
        const it = A.P.iterations.find(x => x.id === el.dataset.id);
        if (it && it.status === 'planned') A.state.planIterId = it.id;
        location.hash = '#iterations';
    });
})();
