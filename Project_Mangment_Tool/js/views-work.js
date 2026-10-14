/* Views: Overview, Work (WBS or backlog), Board */
(function () {
    const A = PMT.app;
    const { esc, toast, avatar, STATUS, MOSCOW } = PMT.ui;
    const D = PMT.dates;

    const pts = items => items.reduce((s, i) => s + (Number(i.estimate) || 0), 0);
    const days = items => items.reduce((s, i) => s + (Number(i.duration) || 0), 0);
    const statusPill = s => `<span class="pill ${s}">${STATUS[s]}</span>`;
    const sizeOf = it => [A.F.points && it.estimate != null && it.estimate !== '' ? `${it.estimate} pt` : '', A.F.schedule && it.duration ? `${it.duration}d` : ''].filter(Boolean).join(' · ');

    // ══════════════════════════ Overview ══════════════════════════
    function flowStats() {
        const done = A.work().filter(i => i.status === 'done' && i.doneAt && i.startedAt);
        const cycle = done.map(i => Math.max(0.1, (new Date(i.doneAt) - new Date(i.startedAt)) / 86400000));
        const avg = cycle.length ? cycle.reduce((a, b) => a + b, 0) / cycle.length : null;
        const since = Date.now() - 14 * 86400000;
        const throughput = A.work().filter(i => i.doneAt && new Date(i.doneAt) >= since).length;
        return { avg, throughput, wip: A.work().filter(i => i.status === 'doing').length };
    }

    A.register('overview', {
        render() {
            const P = A.P, F = A.F;
            const work = A.work();
            const done = work.filter(i => i.status === 'done').length;
            const pct = work.length ? Math.round(done / work.length * 100) : 0;
            const tiles = [
                `<div class="card kpi"><div class="n">${pct}%</div><div class="l">${done} of ${work.length} work items done</div><div class="bar" style="margin-top: 0.5rem;"><div style="width:${pct}%"></div></div></div>`,
                `<div class="card kpi"><div class="n">${work.filter(i => i.status === 'doing').length}</div><div class="l">in progress</div></div>`,
                `<div class="card kpi"><div class="n">${work.filter(i => !i.assigneeId && i.status !== 'done').length}</div><div class="l">open items not assigned</div></div>`
            ];
            if (F.iterations) {
                const it = A.activeIteration();
                if (it) {
                    const items = work.filter(i => i.iterationId === it.id);
                    const left = Math.max(0, D.workdaysInRange(D.todayISO(), it.end).length);
                    tiles.push(`<div class="card kpi"><div class="n">${pts(items.filter(i => i.status === 'done'))}/${pts(items)}</div><div class="l">points done in ${esc(it.name)} · ${left} working day${left === 1 ? '' : 's'} left</div></div>`);
                } else tiles.push(`<div class="card kpi"><div class="n">—</div><div class="l">No active ${F.iterName.toLowerCase()}. <a href="#iterations">Plan one</a></div></div>`);
            }
            if (F.schedule) {
                const s = PMT.schedule.buildSchedule(P);
                const last = P.milestones.filter(m => m.targetDate).sort((a, b) => b.targetDate.localeCompare(a.targetDate))[0];
                const late = last && s.finishDate > last.targetDate;
                tiles.push(`<div class="card kpi"><div class="n" style="font-size: 1.3rem;">${D.fmt(s.finishDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div><div class="l">forecast finish${last ? ` · target ${D.fmt(last.targetDate)}${late ? ' <strong style="color: var(--bad);">(late)</strong>' : ''}` : ''}</div></div>`);
            }
            if (F.flowMetrics) {
                const fs = flowStats();
                tiles.push(`<div class="card kpi"><div class="n">${fs.avg == null ? '—' : fs.avg.toFixed(1) + 'd'}</div><div class="l">average cycle time · ${fs.throughput} done in 14 days</div></div>`);
            }

            const workload = P.members.map(m => {
                const mine = work.filter(i => i.assigneeId === m.id && i.status !== 'done');
                return { m, open: mine.length, doing: mine.filter(i => i.status === 'doing').length, size: F.points ? `${pts(mine)} pt` : F.schedule ? `${days(mine)}d` : '' };
            });
            const nextMs = F.milestones ? (() => {
                const s = PMT.schedule.buildSchedule(P);
                return P.milestones.map(m => {
                    const items = m.itemIds.map(A.item).filter(Boolean);
                    const reached = items.length && items.every(i => i.status === 'done');
                    return { m, reached, forecast: PMT.schedule.milestoneForecast(P, m, s), doneN: items.filter(i => i.status === 'done').length, n: items.length };
                }).filter(x => !x.reached).slice(0, 3);
            })() : [];
            const risks = P.risks.filter(r => r.status === 'open').sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, 3);

            return {
                sub: P.description || `Started ${D.fmt(P.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}`,
                html: `
                <div class="grid grid-4" style="margin-bottom: 1rem;">${tiles.join('')}</div>
                ${!work.length ? `<div class="card empty" style="margin-bottom: 1rem;"><div class="big">📋</div><h3>Add your first work item</h3><p>Break the project into pieces of work, then assign and track them.</p><p style="margin-top: 0.8rem;">${A.F.hierarchy ? '<button class="btn btn-ghost" data-act="newGroup">＋ Deliverable</button> ' : ''}<button class="btn btn-primary" data-act="newItem">＋ Work item</button></p></div>` : ''}
                <div class="grid grid-2">
                    <div class="card"><h3>How this project runs</h3>
                        <p class="muted small" style="margin-bottom: 0.5rem;">${PMT.methodIcon(P.method)} ${esc(PMT.methodName(P.method))}. Change it in <a href="#settings">Settings</a>.</p>
                        <table class="tbl"><tbody>${PMT.describeMethod(P.method).map(d => `<tr><td><strong>${d.area}</strong></td><td>${d.choice}<div class="muted small">${d.hint}</div></td></tr>`).join('')}</tbody></table></div>
                    <div class="card"><h3>Workload</h3>
                        ${P.members.length ? `<table class="tbl"><thead><tr><th>Person</th><th>Open</th><th>In progress</th>${F.points || F.schedule ? '<th>Size</th>' : ''}</tr></thead><tbody>
                        ${workload.map(w => `<tr><td style="display: flex; gap: 0.5rem; align-items: center;">${avatar(w.m)}<span>${esc(w.m.name)}<div class="muted small">${esc(w.m.role)}</div></span></td><td>${w.open}</td><td>${w.doing}</td>${F.points || F.schedule ? `<td class="mono">${w.size}</td>` : ''}</tr>`).join('')}</tbody></table>` : '<p class="muted">No team members yet.</p>'}
                        <p style="margin-top: 0.6rem;"><a href="#team">Manage the team →</a></p></div>
                    ${F.milestones ? `<div class="card"><h3>Next milestones</h3>${nextMs.length ? nextMs.map(x => `<div style="display: flex; justify-content: space-between; gap: 0.6rem; padding: 0.45rem 0; border-bottom: 1px solid var(--line-2);"><span>◆ ${esc(x.m.name)}<div class="muted small">${x.doneN}/${x.n} items done</div></span><span class="small" style="text-align: right;">${x.m.targetDate ? `Target ${D.fmt(x.m.targetDate)}` : ''}${x.forecast ? `<div class="${x.m.targetDate && x.forecast > x.m.targetDate ? '' : 'muted'}" style="${x.m.targetDate && x.forecast > x.m.targetDate ? 'color: var(--bad); font-weight: 600;' : ''}">Forecast ${D.fmt(x.forecast)}</div>` : ''}</span></div>`).join('') : '<p class="muted">All milestones reached, or none set.</p>'}<p style="margin-top: 0.6rem;"><a href="#milestones">All milestones →</a></p></div>` : ''}
                    <div class="card"><h3>Top risks</h3>${risks.length ? risks.map(r => `<div style="display: flex; justify-content: space-between; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px solid var(--line-2);"><span>${esc(r.title)}</span><span class="pill ${r.probability * r.impact >= 15 ? 'crit' : r.probability * r.impact >= 8 ? 'doing' : ''}">${r.probability * r.impact}</span></div>`).join('') : '<p class="muted">No open risks.</p>'}<p style="margin-top: 0.6rem;"><a href="#risks">Risk register →</a></p></div>
                    <div class="card"><h3>Recent activity</h3>${P.activity.slice(-8).reverse().map(a => `<div style="padding: 0.35rem 0; border-bottom: 1px solid var(--line-2); font-size: 0.86rem;">${esc(a.text)}<div class="muted small">${new Date(a.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div></div>`).join('')}</div>
                </div>`
            };
        }
    });

    // ══════════════════════════ Work ══════════════════════════
    A.state.showDone = true;
    A.state.search = '';
    A.state.who = '';

    function matches(i) {
        if (!A.state.showDone && i.status === 'done') return false;
        if (A.state.who === 'none' && i.assigneeId) return false;
        if (A.state.who && A.state.who !== 'none' && i.assigneeId !== A.state.who) return false;
        if (A.state.search && !i.title.toLowerCase().includes(A.state.search.toLowerCase())) return false;
        return true;
    }
    const whoOptions = () => `<option value="">Everyone</option><option value="none" ${A.state.who === 'none' ? 'selected' : ''}>Unassigned</option>${A.P.members.map(m => `<option value="${m.id}" ${A.state.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}`;

    function itemRow(i, opts = {}) {
        const F = A.F, m = A.member(i.assigneeId), iter = F.iterations && i.iterationId ? A.P.iterations.find(x => x.id === i.iterationId) : null;
        return `<tr class="clickable ${i.status === 'done' ? 'is-done' : ''}" data-act="openItem" data-id="${i.id}">
            ${opts.rankCell || ''}
            <td>${F.hierarchy ? `<span class="mono muted small" style="margin-right: 0.4rem;">${A.code(i)}</span>` : ''}<span class="t">${esc(i.title)}</span>
                <div class="muted small">${[!F.hierarchy && i.parentId ? `📁 ${esc(A.groupName(i))}` : '', i.type === 'bug' ? '🐞 Bug' : i.type === 'story' ? 'Story' : '', (i.deps || []).length && F.schedule ? `after ${i.deps.length} item${i.deps.length > 1 ? 's' : ''}` : '', iter ? `🔁 ${esc(iter.name)}` : ''].filter(Boolean).join(' · ')}</div></td>
            ${F.moscow ? `<td><span class="pill ${i.moscow || 'S'}">${MOSCOW[i.moscow || 'S']}</span></td>` : ''}
            <td class="mono small">${sizeOf(i) || '<span class="muted">—</span>'}</td>
            <td><span style="display: inline-flex; align-items: center; gap: 0.4rem;">${avatar(m)}<span class="small">${m ? esc(m.name) : '<span class="muted">Unassigned</span>'}</span></span></td>
            <td>${statusPill(i.status)}</td>
            ${opts.endCell || ''}
        </tr>`;
    }
    const headCols = (extraFirst = '', extraLast = '') => `<tr>${extraFirst}<th>Item</th>${A.F.moscow ? '<th>Priority</th>' : ''}<th>Size</th><th>Assigned</th><th>Status</th>${extraLast}</tr>`;
    const move = (act, id, dir, disabled, label) => `<button class="icon-btn" data-act="${act}" data-id="${id}" data-dir="${dir}" ${disabled ? 'disabled' : ''} aria-label="${label}">${dir < 0 ? '▲' : '▼'}</button>`;

    function moscowSummary() {
        const items = A.work().filter(i => i.status !== 'done');
        const total = A.F.points ? pts(items) : days(items);
        if (!total) return '';
        const by = k => (A.F.points ? pts : days)(items.filter(i => (i.moscow || 'S') === k));
        const share = k => Math.round(by(k) / total * 100);
        const mustShare = share('M');
        return `<div class="card" style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;"><strong>Remaining effort by priority</strong><span class="small muted">${total} ${A.F.points ? 'points' : 'days'} left</span></div>
            <div style="display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin: 0.5rem 0; background: var(--line-2);">
                ${[['M', '#D64545'], ['S', '#B7791F'], ['C', '#20B2AA'], ['W', '#9CA3AF']].map(([k, c]) => `<div style="width:${share(k)}%; background:${c}" title="${MOSCOW[k]}: ${share(k)}%"></div>`).join('')}
            </div>
            <div class="small muted">${['M', 'S', 'C', 'W'].map(k => `${MOSCOW[k]} ${share(k)}%`).join(' · ')}</div>
            ${mustShare > 60 ? `<div class="note warn" style="margin-top: 0.6rem;">Musts are ${mustShare}% of the remaining effort. Keep them at or below 60% so there's room to protect the deadline.</div>` : ''}
        </div>`;
    }

    A.register('work', {
        render() {
            const F = A.F;
            const toolbar = `<div class="view-head">
                <div class="toolbar">
                    <input class="input" type="search" id="workSearch" placeholder="Search items" value="${esc(A.state.search)}" aria-label="Search items">
                    <select class="select" data-change="filterWho" aria-label="Filter by person">${whoOptions()}</select>
                    <label class="small" style="display: flex; gap: 0.35rem; align-items: center;"><input type="checkbox" data-change="toggleDone" ${A.state.showDone ? 'checked' : ''}> Show done</label>
                </div>
                <div class="toolbar"><button class="btn btn-ghost" data-act="newGroup">＋ ${F.hierarchy ? 'Deliverable' : 'Epic'}</button></div>
            </div>`;

            if (F.hierarchy) {
                const groups = A.groups();
                const loose = A.work().filter(i => !i.parentId || !A.item(i.parentId)).filter(matches);
                const body = groups.map((g, gi) => {
                    const kids = A.childrenOf(g.id);
                    const shown = kids.filter(matches);
                    const doneN = kids.filter(k => k.status === 'done').length;
                    return `<tr class="group-row"><td colspan="${F.moscow ? 5 : 4}">
                            <span class="mono" style="margin-right: 0.4rem;">${A.code(g)}</span><button class="icon-btn" style="font-weight: 700; color: var(--ink);" data-act="openItem" data-id="${g.id}">${esc(g.title)}</button>
                            <span class="muted small" style="margin-left: 0.4rem;">${doneN}/${kids.length} done${F.schedule ? ` · ${days(kids)}d` : ''}${F.points ? ` · ${pts(kids)} pt` : ''}</span></td>
                        <td style="text-align: right; white-space: nowrap;">${move('moveGroup', g.id, -1, gi === 0, 'Move deliverable up')}${move('moveGroup', g.id, 1, gi === groups.length - 1, 'Move deliverable down')}<button class="icon-btn" data-act="newItem" data-parent-id="${g.id}" aria-label="Add item to ${esc(g.title)}">＋</button></td></tr>
                        ${shown.map((i, ii) => itemRow(i, { endCell: `<td style="text-align: right; white-space: nowrap;">${move('moveChild', i.id, -1, kids.indexOf(i) === 0, 'Move up')}${move('moveChild', i.id, 1, kids.indexOf(i) === kids.length - 1, 'Move down')}</td>` })).join('')}
                        ${!kids.length ? `<tr><td colspan="${F.moscow ? 6 : 5}" class="muted small" style="padding-left: 2rem;">No work packages yet. <button class="icon-btn" data-act="newItem" data-parent-id="${g.id}">＋ Add one</button></td></tr>` : ''}`;
                }).join('');
                const looseRows = loose.length ? `<tr class="group-row"><td colspan="${F.moscow ? 6 : 5}">Not in a deliverable</td></tr>${loose.map(i => itemRow(i, { endCell: '<td></td>' })).join('')}` : '';
                return {
                    sub: 'Work breakdown structure: deliverables broken into work packages',
                    html: toolbar + (F.moscow ? moscowSummary() : '') + (groups.length || loose.length
                        ? `<div class="table-wrap"><table class="tbl"><thead>${headCols('', '<th></th>')}</thead><tbody>${body}${looseRows}</tbody></table></div>
                           <p class="muted small" style="margin-top: 0.6rem;">100% rule: everything the project delivers should appear here, and nothing outside its scope.</p>`
                        : `<div class="card empty"><div class="big">🌳</div><h3>Build your work breakdown</h3><p>Add the main deliverables first, then break each into work packages.</p><p style="margin-top: 0.8rem;"><button class="btn btn-primary" data-act="newGroup">＋ First deliverable</button></p></div>`)
                };
            }

            const list = A.ranked().filter(matches);
            const all = A.ranked().filter(i => i.status !== 'done');
            const canRank = F.ranked || F.moscow;
            return {
                sub: F.moscow ? 'Requirements prioritised with MoSCoW' : 'Ordered by value: the top is done first',
                html: toolbar + (F.moscow ? moscowSummary() : '') + (list.length
                    ? `<div class="table-wrap"><table class="tbl"><thead>${headCols(canRank ? '<th>#</th>' : '')}</thead><tbody>
                        ${list.map(i => {
                            const idx = all.indexOf(i);
                            const rankCell = canRank ? `<td style="white-space: nowrap;"><span class="mono muted small">${idx >= 0 ? idx + 1 : '✓'}</span> ${idx >= 0 ? move('moveRank', i.id, -1, idx === 0, 'Move up') + move('moveRank', i.id, 1, idx === all.length - 1, 'Move down') : ''}</td>` : '';
                            return itemRow(i, { rankCell });
                        }).join('')}</tbody></table></div>`
                    : `<div class="card empty"><div class="big">📋</div><h3>${A.work().length ? 'Nothing matches the filters' : 'Your backlog is empty'}</h3><p>${A.work().length ? 'Clear the search or filters.' : 'Add the work you know about now; you can refine it as you learn.'}</p></div>`)
            };
        },
        mount(root) {
            const s = root.querySelector('#workSearch');
            if (s) s.addEventListener('input', () => {
                A.state.search = s.value;
                const pos = s.selectionStart;
                A.render();
                const again = document.getElementById('workSearch');
                again.focus();
                again.setSelectionRange(pos, pos);
            });
        }
    });

    A.action('filterWho', el => { A.state.who = el.value; A.render(); });
    A.action('toggleDone', el => { A.state.showDone = el.checked; A.render(); });
    A.action('moveRank', el => {
        const list = A.ranked().filter(i => i.status !== 'done');
        const i = list.findIndex(x => x.id === el.dataset.id), j = i + Number(el.dataset.dir);
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i].rank, list[j].rank] = [list[j].rank, list[i].rank];
        if (list[i].rank === list[j].rank) list[j].rank += Number(el.dataset.dir) > 0 ? -0.5 : 0.5;
        A.commit(`Reordered "${list[i].title}"`);
    });
    A.action('moveChild', el => {
        const it = A.item(el.dataset.id);
        const kids = A.childrenOf(it.parentId);
        const i = kids.indexOf(it), j = i + Number(el.dataset.dir);
        if (j < 0 || j >= kids.length) return;
        kids.splice(i, 1); kids.splice(j, 0, it);
        kids.forEach((k, n) => { k.order = n; });
        A.commit();
    });
    A.action('moveGroup', el => {
        const gs = A.groups();
        const g = A.item(el.dataset.id);
        const i = gs.indexOf(g), j = i + Number(el.dataset.dir);
        if (j < 0 || j >= gs.length) return;
        gs.splice(i, 1); gs.splice(j, 0, g);
        gs.forEach((x, n) => { x.order = n; });
        A.commit();
    });

    // ══════════════════════════ Board ══════════════════════════
    A.state.boardScope = null;
    function boardScope() {
        if (!A.F.iterations) return 'all';
        if (A.state.boardScope) return A.state.boardScope;
        return A.activeIteration() ? 'iteration' : 'all';
    }

    A.register('board', {
        render() {
            const F = A.F;
            const scope = boardScope();
            const active = A.activeIteration();
            const cols = scope === 'iteration' ? ['todo', 'doing', 'review', 'done'] : ['backlog', 'todo', 'doing', 'review', 'done'];
            let items = A.ranked().filter(i => (!A.state.who || (A.state.who === 'none' ? !i.assigneeId : i.assigneeId === A.state.who)));
            if (scope === 'iteration') items = active ? items.filter(i => i.iterationId === active.id) : [];
            const limit = Number(A.P.settings.wipLimit) || 3;
            const doingAll = A.work().filter(i => i.status === 'doing').length;

            const card = i => {
                const g = A.item(i.parentId);
                const ci = cols.indexOf(i.status);
                return `<div class="kcard" draggable="true" data-id="${i.id}" style="--g:${g ? PMT.ui.colorFor(g.id) : 'var(--line)'}">
                    <div class="k-top"><span>${F.hierarchy && A.code(i) ? `<span class="mono">${A.code(i)}</span> ` : ''}${g ? esc(g.title) : ''}</span><span>${i.type === 'bug' ? '🐞' : ''}</span></div>
                    <button class="k-title" data-act="openItem" data-id="${i.id}">${esc(i.title)}</button>
                    <div class="k-foot">
                        ${F.moscow ? `<span class="pill ${i.moscow || 'S'}">${(i.moscow || 'S')}</span>` : ''}
                        ${sizeOf(i) ? `<span class="pill">${sizeOf(i)}</span>` : ''}
                        <button class="icon-btn" data-act="moveCard" data-id="${i.id}" data-dir="-1" ${ci <= 0 ? 'disabled' : ''} aria-label="Move ${esc(i.title)} left">◀</button>
                        <button class="icon-btn" data-act="moveCard" data-id="${i.id}" data-dir="1" ${ci === cols.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(i.title)} right">▶</button>
                        ${avatar(A.member(i.assigneeId))}
                    </div></div>`;
            };

            const head = `<div class="view-head"><div class="toolbar">
                ${F.iterations ? `<div class="seg small" role="radiogroup" aria-label="Board scope">
                    <button role="radio" aria-checked="${scope === 'iteration'}" data-act="boardScope" data-v="iteration">${active ? esc(active.name) : `Active ${F.iterName.toLowerCase()}`}</button>
                    <button role="radio" aria-checked="${scope === 'all'}" data-act="boardScope" data-v="all">All work</button></div>` : ''}
                <select class="select" data-change="filterWho" aria-label="Filter by person">${whoOptions()}</select>
                ${F.flow ? `<span class="small ${doingAll >= limit ? '' : 'muted'}" style="${doingAll >= limit ? 'color: var(--warn); font-weight: 600;' : ''}">WIP ${doingAll}/${limit}</span>` : ''}
            </div></div>`;

            if (scope === 'iteration' && !active) {
                return { sub: 'Drag cards as work moves', html: head + `<div class="card empty"><div class="big">🔁</div><h3>No active ${F.iterName.toLowerCase()}</h3><p>Plan and start one to see its board here.</p><p style="margin-top: 0.8rem;"><a class="btn btn-primary" href="#iterations">Go to ${F.iterName}s</a></p></div>` };
            }
            return {
                sub: scope === 'iteration' ? `${esc(active.name)}${active.goal ? ` · Goal: ${esc(active.goal)}` : ''}` : 'Drag cards as work moves, or use ◀ ▶',
                html: head + `<div class="board">${cols.map(c => {
                    const list = items.filter(i => i.status === c);
                    const full = F.flow && c === 'doing' && doingAll >= limit;
                    return `<div class="col ${full ? 'full' : ''}" data-col="${c}"><div class="col-head"><span>${STATUS[c]}</span><span class="cnt">${list.length}${F.flow && c === 'doing' ? ` / ${limit}` : ''}</span></div>
                        <div class="cards">${list.map(card).join('')}</div></div>`;
                }).join('')}</div>`
            };
        },
        mount(root) {
            root.querySelectorAll('.kcard').forEach(c => {
                c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
                c.addEventListener('dragend', () => c.classList.remove('dragging'));
            });
            root.querySelectorAll('.col').forEach(col => {
                col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
                col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
                col.addEventListener('drop', e => {
                    e.preventDefault();
                    col.classList.remove('over');
                    const it = A.item(e.dataTransfer.getData('text/plain'));
                    if (it && A.setStatus(it, col.dataset.col)) A.commit();
                });
            });
        }
    });

    A.action('boardScope', el => { A.state.boardScope = el.dataset.v; A.render(); });
    A.action('moveCard', el => {
        const it = A.item(el.dataset.id);
        const cols = boardScope() === 'iteration' ? ['todo', 'doing', 'review', 'done'] : ['backlog', 'todo', 'doing', 'review', 'done'];
        const next = cols[cols.indexOf(it.status) + Number(el.dataset.dir)];
        if (next && A.setStatus(it, next)) {
            A.commit(null, next === 'done' ? `"${it.title}" done ✓` : null, next === 'done' ? 'good' : '');
            const again = document.querySelector(`[data-act="moveCard"][data-id="${it.id}"][data-dir="${el.dataset.dir}"]:not([disabled])`) || document.querySelector(`[data-act="moveCard"][data-id="${it.id}"]:not([disabled])`);
            again?.focus();
        }
    });
})();
