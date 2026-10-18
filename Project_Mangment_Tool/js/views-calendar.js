/* ===================================================================
   View: Calendar (Google Calendar-style).
   • Month and Week views, Today / ‹ › navigation
   • Your own events: meetings, reminders, deadlines, anything else;
     all-day or timed, repeating, with attendees and a linked work item
   • Project layers: work-item due dates (or spans), milestones, sprints
   • Export everything as .ics for Google Calendar / Outlook
   Events are stored in project.events.
   =================================================================== */
(function () {
    const A = PMT.app;
    const { esc, toast, avatar, STATUS } = PMT.ui;
    const D = PMT.dates;
    const HOUR = 48; // px per hour in week view

    const KINDS = {
        meeting: { label: 'Meeting', icon: '👥', color: '#168C86' },
        reminder: { label: 'Reminder', icon: '🔔', color: '#C98A06' },
        deadline: { label: 'Deadline', icon: '⏰', color: '#D64545' },
        other: { label: 'Other', icon: '📌', color: '#7A5CD6' }
    };
    const REPEAT = { none: 'Does not repeat', weekdays: 'Every weekday (Mon–Fri)', weekly: 'Every week', monthly: 'Every month' };
    const STATUS_COLOR = { backlog: '#8FA3BF', todo: '#8FA3BF', doing: '#2F6FD0', review: '#7A5CD6', done: '#36B37E' };

    A.state.cal = A.state.cal || { mode: 'month', cursor: D.todayISO(), show: { events: true, items: true, milestones: true, sprints: true }, itemMode: 'due' };

    const dow = iso => D.toDate(iso).getUTCDay();
    const mondayOf = iso => D.addDays(iso, -((dow(iso) + 6) % 7));
    const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
    const fmtTime = t => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, m ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' }); };
    const monthTitle = iso => D.toDate(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

    // ─── Everything that falls between two dates, as calendar entries ───
    function entries(from, to) {
        const P = A.P, F = A.F, show = A.state.cal.show, out = [];
        const overlaps = (s, e) => s <= to && e >= from;

        if (show.events) (P.events || []).forEach(ev => {
            const len = ev.allDay && ev.endDate ? D.daysBetween(ev.date, ev.endDate) : 0;
            const push = start => {
                const end = D.addDays(start, len);
                if (overlaps(start, end)) out.push({ type: 'event', id: ev.id, title: ev.title, start, end, allDay: !!ev.allDay, time: ev.allDay ? null : { start: ev.start, end: ev.end }, color: KINDS[ev.kind]?.color || KINDS.other.color, icon: KINDS[ev.kind]?.icon || '📌', repeat: ev.repeat !== 'none' && ev.repeat });
            };
            if (!ev.repeat || ev.repeat === 'none') return push(ev.date);
            if (ev.repeat === 'weekdays') {
                for (let d = ev.date > from ? ev.date : from; d <= to; d = D.addDays(d, 1)) if (dow(d) !== 0 && dow(d) !== 6 && d >= ev.date) push(d);
            } else if (ev.repeat === 'weekly') {
                let d = ev.date;
                if (d < from) d = D.addDays(d, Math.floor(D.daysBetween(d, from) / 7) * 7);
                for (; d <= to; d = D.addDays(d, 7)) push(d);
            } else if (ev.repeat === 'monthly') {
                const day = D.toDate(ev.date).getUTCDate();
                const f = D.toDate(from);
                for (let k = -1; k < 3; k++) {
                    const m = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + k, day));
                    if (m.getUTCDate() !== day) continue;   // e.g. no 31st this month
                    const iso = D.toISO(m);
                    if (iso >= ev.date) push(iso);
                }
            }
        });

        if (show.items) A.work().forEach(i => {
            if (A.state.cal.itemMode === 'span' && i.startDate && i.dueDate) {
                if (overlaps(i.startDate, i.dueDate)) out.push({ type: 'item', id: i.id, title: `${A.keyOf(i)} ${i.title}`, start: i.startDate, end: i.dueDate, allDay: true, color: STATUS_COLOR[i.status], done: i.status === 'done' });
            } else if (i.dueDate && overlaps(i.dueDate, i.dueDate)) {
                const late = i.status !== 'done' && i.dueDate < D.todayISO();
                out.push({ type: 'item', id: i.id, title: `${A.keyOf(i)} ${i.title}`, start: i.dueDate, end: i.dueDate, allDay: true, color: late ? '#D64545' : STATUS_COLOR[i.status], icon: i.status === 'done' ? '✓' : late ? '⚠' : '📄', done: i.status === 'done' });
            }
        });

        if (show.milestones) P.milestones.filter(m => m.targetDate && overlaps(m.targetDate, m.targetDate)).forEach(m => {
            const items = m.itemIds.map(A.item).filter(Boolean);
            const reached = items.length && items.every(i => i.status === 'done');
            out.push({ type: 'milestone', id: m.id, title: m.name, start: m.targetDate, end: m.targetDate, allDay: true, color: reached ? '#1F9D6B' : '#1F2A37', icon: '◆' });
        });

        if (show.sprints && F.iterations) P.iterations.filter(it => overlaps(it.start, it.end)).forEach(it => {
            out.push({ type: 'sprint', id: it.id, title: `${it.name}${it.goal ? ` · ${it.goal}` : ''}`, start: it.start, end: it.end, allDay: true, color: it.status === 'active' ? '#8B6FE8' : '#B9A8F0', icon: '🔁', soft: true });
        });
        return out;
    }

    // Stack all-day/multi-day entries into lanes within one week
    function lanes(list, ws, we) {
        const rows = [];
        const sorted = list.map(e => ({ ...e, s: e.start < ws ? ws : e.start, e2: e.end > we ? we : e.end }))
            .sort((a, b) => a.s.localeCompare(b.s) || D.daysBetween(b.s, b.e2) - D.daysBetween(a.s, a.e2) || (a.type === 'sprint' ? -1 : 1));
        sorted.forEach(e => {
            let lane = rows.findIndex(r => r < e.s);
            if (lane < 0) { rows.push(e.e2); lane = rows.length - 1; } else rows[lane] = e.e2;
            e.lane = lane;
        });
        return { list: sorted, count: rows.length };
    }

    const chip = (e, extra = '', pos = '') => `<button class="cal-ev ${e.type} ${e.done ? 'done' : ''} ${e.soft ? 'soft' : ''} ${extra}" style="${pos}--c:${e.color}" data-act="calOpen" data-type="${e.type}" data-id="${e.id}" title="${esc(e.title)}${e.time ? ` · ${fmtTime(e.time.start)}–${fmtTime(e.time.end)}` : ''}">${e.time ? `<span class="cal-dot"></span><span class="cal-time">${fmtTime(e.time.start)}</span>` : e.icon ? `<span class="cal-ico">${e.icon}</span>` : ''}<span class="cal-t">${esc(e.title)}</span>${e.repeat ? '<span class="cal-rep" aria-label="repeats">↻</span>' : ''}</button>`;

    // ─── Month ───
    function monthView() {
        const cur = A.state.cal.cursor, today = D.todayISO();
        const first = cur.slice(0, 8) + '01';
        const monthNo = D.toDate(first).getUTCMonth();
        const start = mondayOf(first);
        const weeks = [];
        for (let ws = start; weeks.length < 6; ws = D.addDays(ws, 7)) {
            if (weeks.length >= 4 && D.toDate(ws).getUTCMonth() !== monthNo) break;
            weeks.push(ws);
        }
        const all = entries(start, D.addDays(weeks[weeks.length - 1], 6));
        const head = Array.from({ length: 7 }, (_, k) => D.toDate(D.addDays(start, k)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }));
        return `<div class="cal-month" role="grid" aria-label="${esc(monthTitle(cur))}">
            <div class="cal-head" role="row">${head.map(h => `<div role="columnheader">${h}</div>`).join('')}</div>
            ${weeks.map(ws => {
                const we = D.addDays(ws, 6);
                const days = Array.from({ length: 7 }, (_, k) => D.addDays(ws, k));
                const inWeek = all.filter(e => e.start <= we && e.end >= ws);
                const L = lanes(inWeek.filter(e => e.allDay), ws, we);
                const timed = inWeek.filter(e => !e.allDay);
                return `<div class="cal-week" role="row">
                    <div class="cal-bg">${days.map(d => `<div class="cal-cell ${D.toDate(d).getUTCMonth() !== monthNo ? 'out' : ''} ${d === today ? 'today' : ''} ${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}" data-act="calAdd" data-date="${d}" title="Add on ${D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}"></div>`).join('')}</div>
                    <div class="cal-fg" style="grid-template-rows: 28px repeat(${L.count}, 24px) auto;">
                        ${days.map((d, k) => `<button class="cal-dnum ${d === today ? 'today' : ''} ${D.toDate(d).getUTCMonth() !== monthNo ? 'out' : ''}" style="grid-column:${k + 1}; grid-row: 1" data-act="calDay" data-date="${d}" aria-label="${D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}: open week">${D.toDate(d).getUTCDate() === 1 ? D.fmt(d) : D.toDate(d).getUTCDate()}</button>`).join('')}
                        ${L.list.map(e => {
                            const cs = D.daysBetween(ws, e.s) + 1, ce = D.daysBetween(ws, e.e2) + 2;
                            return chip(e, `span ${e.start < ws ? 'cont-l' : ''} ${e.end > we ? 'cont-r' : ''}`, `grid-column:${cs} / ${ce}; grid-row:${e.lane + 2}; `);
                        }).join('')}
                        ${days.map((d, k) => {
                            const list = timed.filter(e => e.start === d).sort((a, b) => toMin(a.time.start) - toMin(b.time.start));
                            return list.length ? `<div class="cal-timed" style="grid-column:${k + 1}; grid-row:${L.count + 2}">${list.map(e => chip(e)).join('')}</div>` : '';
                        }).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    // ─── Week ───
    function weekView() {
        const ws = mondayOf(A.state.cal.cursor), we = D.addDays(ws, 6), today = D.todayISO();
        const days = Array.from({ length: 7 }, (_, k) => D.addDays(ws, k));
        const all = entries(ws, we);
        const L = lanes(all.filter(e => e.allDay), ws, we);
        const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
        const col = d => {
            const list = all.filter(e => !e.allDay && e.start === d).map(e => ({ ...e, s: toMin(e.time.start), e3: Math.max(toMin(e.time.end), toMin(e.time.start) + 20) })).sort((a, b) => a.s - b.s);
            // Side-by-side columns for overlapping events
            const colsEnd = [];
            list.forEach(e => { let c = colsEnd.findIndex(end => end <= e.s); if (c < 0) { colsEnd.push(e.e3); c = colsEnd.length - 1; } else colsEnd[c] = e.e3; e.col = c; });
            const n = Math.max(1, colsEnd.length);
            return list.map(e => `<button class="cal-block" style="--c:${e.color}; top:${e.s / 60 * HOUR}px; height:${Math.max(20, (e.e3 - e.s) / 60 * HOUR - 2)}px; left:calc(${e.col / n * 100}% + 2px); width:calc(${100 / n}% - 4px)" data-act="calOpen" data-type="${e.type}" data-id="${e.id}">
                <strong>${esc(e.title)}${e.repeat ? ' ↻' : ''}</strong><span>${fmtTime(e.time.start)} – ${fmtTime(e.time.end)}</span></button>`).join('');
        };
        return `<div class="cal-weekview">
            <div class="cw-head"><div class="cw-gutter"></div>${days.map(d => `<button class="cw-day ${d === today ? 'today' : ''}" data-act="calAdd" data-date="${d}" title="Add on ${D.fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}"><span>${D.toDate(d).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</span><b>${D.toDate(d).getUTCDate()}</b></button>`).join('')}</div>
            <div class="cw-allday"><div class="cw-gutter small muted">All day</div>
                <div class="cw-lanes" style="grid-template-rows: repeat(${Math.max(1, L.count)}, 24px);">${L.list.map(e => chip(e, `span ${e.start < ws ? 'cont-l' : ''} ${e.end > we ? 'cont-r' : ''}`, `grid-column:${D.daysBetween(ws, e.s) + 1} / ${D.daysBetween(ws, e.e2) + 2}; grid-row:${e.lane + 1}; `)).join('')}</div>
            </div>
            <div class="cw-scroll" id="cwScroll">
                <div class="cw-grid" style="height:${24 * HOUR}px">
                    <div class="cw-gutter cw-hours">${Array.from({ length: 24 }, (_, h) => `<span style="top:${h * HOUR}px">${h ? fmtTime(`${h}:00`) : ''}</span>`).join('')}</div>
                    ${days.map(d => `<div class="cw-col ${d === today ? 'today' : ''} ${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}" data-act="calSlot" data-date="${d}" style="background-size: 100% ${HOUR}px">
                        ${col(d)}${d === today ? `<span class="cw-now" style="top:${nowMin / 60 * HOUR}px"></span>` : ''}</div>`).join('')}
                </div>
            </div>
        </div>`;
    }

    // ─── Upcoming list (next 14 days) ───
    function upcoming() {
        const today = D.todayISO(), until = D.addDays(today, 14);
        const list = entries(today, until).filter(e => e.type !== 'sprint' && !e.done)
            .map(e => ({ ...e, day: e.start < today ? today : e.start }))
            .sort((a, b) => a.day.localeCompare(b.day) || (a.time ? toMin(a.time.start) : -1) - (b.time ? toMin(b.time.start) : -1)).slice(0, 10);
        if (!list.length) return '<p class="muted small">Nothing in the next two weeks.</p>';
        let last = '';
        return list.map(e => {
            const h = e.day !== last ? `<div class="cal-up-day">${e.day === today ? 'Today' : D.fmt(e.day, { weekday: 'short', day: 'numeric', month: 'short' })}</div>` : '';
            last = e.day;
            return h + `<button class="cal-up" style="--c:${e.color}" data-act="calOpen" data-type="${e.type}" data-id="${e.id}"><span class="cal-dot"></span><span class="cal-t">${esc(e.title)}</span><span class="muted small">${e.time ? fmtTime(e.time.start) : e.type === 'item' ? 'due' : e.type === 'milestone' ? 'milestone' : 'all day'}</span></button>`;
        }).join('');
    }

    A.register('calendar', {
        render() {
            const F = A.F, c = A.state.cal;
            const title = c.mode === 'month' ? monthTitle(c.cursor) : (() => {
                const ws = mondayOf(c.cursor), we = D.addDays(ws, 6);
                return `${D.fmt(ws)} – ${D.fmt(we, { day: 'numeric', month: 'short', year: 'numeric' })}`;
            })();
            const layer = (k, label, color, extra = '') => `<label class="cal-layer"><input type="checkbox" data-change="calLayer" data-k="${k}" ${c.show[k] ? 'checked' : ''} style="accent-color:${color}"> ${label}</label>${extra}`;
            return {
                sub: 'Meetings, reminders, deadlines, and every project date in one place',
                html: `<div class="cal-bar">
                        <div class="toolbar">
                            <button class="btn btn-ghost btn-sm" data-act="calToday">Today</button>
                            <button class="icon-btn cal-nav" data-act="calMove" data-dir="-1" aria-label="Previous ${c.mode}">‹</button>
                            <button class="icon-btn cal-nav" data-act="calMove" data-dir="1" aria-label="Next ${c.mode}">›</button>
                            <h2 class="cal-title" aria-live="polite">${esc(title)}</h2>
                        </div>
                        <div class="toolbar">
                            <div class="seg small" role="radiogroup" aria-label="Calendar view"><button role="radio" aria-checked="${c.mode === 'month'}" data-act="calMode" data-v="month">Month</button><button role="radio" aria-checked="${c.mode === 'week'}" data-act="calMode" data-v="week">Week</button></div>
                            <button class="btn btn-ghost btn-sm" data-act="calIcs" title="Download an .ics file for Google Calendar, Outlook, or Apple Calendar">⬇ Export .ics</button>
                            <button class="btn btn-primary btn-sm" data-act="calAdd" data-date="${D.todayISO()}">＋ Create</button>
                        </div>
                    </div>
                    <div class="cal-layout">
                        <aside class="cal-side card">
                            <h3>Show</h3>
                            ${layer('events', 'My events', '#168C86')}
                            ${layer('items', 'Work items', '#2F6FD0', `<select class="select cal-itemmode" data-change="calItemMode" aria-label="How to show work items"><option value="due" ${c.itemMode === 'due' ? 'selected' : ''}>Due dates</option><option value="span" ${c.itemMode === 'span' ? 'selected' : ''}>Start → due</option></select>`)}
                            ${layer('milestones', 'Milestones', '#1F2A37')}
                            ${F.iterations ? layer('sprints', `${esc(F.iterName)}s`, '#8B6FE8') : ''}
                            <h3 style="margin-top: 1rem;">Event types</h3>
                            ${Object.values(KINDS).map(k => `<div class="cal-kind"><span class="cal-dot" style="--c:${k.color}"></span>${k.icon} ${k.label}</div>`).join('')}
                            <h3 style="margin-top: 1rem;">Coming up</h3>
                            <div class="cal-upcoming">${upcoming()}</div>
                        </aside>
                        <div class="cal-main">${c.mode === 'month' ? monthView() : weekView()}</div>
                    </div>`
            };
        },
        mount(root) {
            const sc = root.querySelector('#cwScroll');
            if (sc) sc.scrollTop = 7.5 * HOUR;   // start the day around 7:30
        }
    });

    // ─── Navigation & layers ───
    A.action('calMode', el => { A.state.cal.mode = el.dataset.v; A.render(); });
    A.action('calToday', () => { A.state.cal.cursor = D.todayISO(); A.render(); });
    A.action('calMove', el => {
        const c = A.state.cal, dir = Number(el.dataset.dir);
        if (c.mode === 'week') c.cursor = D.addDays(c.cursor, 7 * dir);
        else { const d = D.toDate(c.cursor); c.cursor = D.toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1))); }
        A.render();
        document.querySelector(`[data-act="calMove"][data-dir="${dir}"]`)?.focus();
    });
    A.action('calDay', el => { A.state.cal.cursor = el.dataset.date; A.state.cal.mode = 'week'; A.render(); });
    A.action('calLayer', el => { A.state.cal.show[el.dataset.k] = el.checked; A.render(); });
    A.action('calItemMode', el => { A.state.cal.itemMode = el.value; A.render(); });
    A.action('calAdd', el => openEvent(null, { date: el.dataset.date }));
    A.action('calSlot', (el, e) => {
        if (e.target !== el) return;   // clicks on events are handled by calOpen
        const y = e.clientY - el.getBoundingClientRect().top;
        const mins = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / HOUR * 2) * 30));
        const t = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        openEvent(null, { date: el.dataset.date, start: t(mins), end: t(Math.min(mins + 60, 23 * 60 + 59)) });
    });
    A.action('calOpen', el => {
        const { type, id } = el.dataset;
        if (type === 'event') return openEvent(id);
        if (type === 'item') return A.openItem(id);
        if (type === 'milestone') return A.F.views.includes('milestones') ? (location.hash = '#milestones') : toast('Milestones are off. Turn them on in Settings → Tools.');
        if (type === 'sprint') { const it = A.P.iterations.find(x => x.id === id); if (it && it.status === 'planned') A.state.planIterId = id; location.hash = '#iterations'; }
    });

    // ─── Event dialog ───
    function ensureDialog() {
        if (document.getElementById('evDialog')) return;
        document.body.insertAdjacentHTML('beforeend', `<dialog id="evDialog" aria-labelledby="evHead">
            <form id="evForm" novalidate>
                <div class="dlg-head"><h2 id="evHead">Event</h2><button type="button" class="icon-btn" data-ev="close" aria-label="Close">✕</button></div>
                <div class="dlg-body" id="evBody"></div>
                <div class="dlg-foot"><button type="button" class="btn btn-danger" data-ev="delete">Delete</button>
                    <span class="toolbar"><button type="button" class="btn btn-ghost" data-ev="close">Cancel</button><button type="submit" class="btn btn-primary">Save</button></span></div>
            </form></dialog>`);
        const dlg = document.getElementById('evDialog');
        dlg.addEventListener('click', e => {
            const b = e.target.closest('[data-ev]');
            if (!b) return;
            if (b.dataset.ev === 'close') dlg.close();
            if (b.dataset.ev === 'delete') deleteEvent();
        });
        document.getElementById('evForm').addEventListener('submit', saveEvent);
    }

    function openEvent(id, defaults = {}) {
        ensureDialog();
        const P = A.P;
        P.events = P.events || [];
        const ev = id ? P.events.find(x => x.id === id) : null;
        const v = ev || { title: '', kind: 'meeting', allDay: false, date: defaults.date || D.todayISO(), endDate: '', start: defaults.start || '09:00', end: defaults.end || '10:00', repeat: 'none', attendees: [], itemId: '', location: '', description: '' };
        const dlg = document.getElementById('evDialog');
        dlg.dataset.id = id || '';
        document.getElementById('evHead').textContent = ev ? 'Edit event' : 'New event';
        dlg.querySelector('[data-ev="delete"]').hidden = !ev;
        document.getElementById('evBody').innerHTML = `
            <label class="sr-only" for="evTitle">Title</label>
            <input class="ed-title" id="evTitle" name="title" maxlength="140" required placeholder="Add title" value="${esc(v.title)}" autocomplete="off">
            <div class="ev-kinds" role="radiogroup" aria-label="Event type">${Object.entries(KINDS).map(([k, x]) => `<label class="ev-kind" style="--c:${x.color}"><input type="radio" name="kind" value="${k}" ${v.kind === k ? 'checked' : ''}><span>${x.icon} ${x.label}</span></label>`).join('')}</div>
            <div class="ev-when">
                <div class="field"><label for="evDate">Date</label><input class="input" type="date" id="evDate" name="date" required value="${v.date}"></div>
                <div class="field ev-timed"><label for="evStart">From</label><input class="input" type="time" id="evStart" name="start" value="${v.start || '09:00'}"></div>
                <div class="field ev-timed"><label for="evEnd">To</label><input class="input" type="time" id="evEnd" name="end" value="${v.end || '10:00'}"></div>
                <div class="field ev-allday-only"><label for="evEndDate">Until (optional)</label><input class="input" type="date" id="evEndDate" name="endDate" value="${v.endDate || ''}"></div>
            </div>
            <div class="row" style="align-items: center;">
                <label class="cal-layer"><input type="checkbox" id="evAllDay" name="allDay" ${v.allDay ? 'checked' : ''}> All day</label>
                <div class="field" style="margin: 0;"><label class="sr-only" for="evRepeat">Repeat</label><select class="select" id="evRepeat" name="repeat">${Object.entries(REPEAT).map(([k, l]) => `<option value="${k}" ${v.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            </div>
            ${ev && ev.repeat !== 'none' ? '<p class="muted small" style="margin-top: 0.4rem;">Changes apply to every occurrence of this repeating event.</p>' : ''}
            ${P.members.length ? `<div class="field" style="margin-top: 0.9rem;"><span class="label">Attendees</span><div class="tchips">${P.members.map(m => `<label class="tchip"><input type="checkbox" name="att" value="${m.id}" ${(v.attendees || []).includes(m.id) ? 'checked' : ''}><span>${avatar(m, 18)} ${esc(m.name)}</span></label>`).join('')}</div></div>` : ''}
            <div class="row">
                <div class="field"><label for="evLoc">Location or meeting link</label><input class="input" id="evLoc" name="location" maxlength="300" value="${esc(v.location || '')}" placeholder="Room 2, or https://meet…"></div>
                <div class="field"><label for="evItem">Linked work item</label><select class="select" id="evItem" name="itemId"><option value="">None</option>${A.ranked().map(i => `<option value="${i.id}" ${v.itemId === i.id ? 'selected' : ''}>${A.keyOf(i)} ${esc(i.title)}</option>`).join('')}</select></div>
            </div>
            <div class="field"><label for="evDesc">Notes</label><textarea class="textarea" id="evDesc" name="description" maxlength="2000" placeholder="Agenda, notes, anything">${esc(v.description || '')}</textarea></div>
            <p class="ev-err" id="evErr" role="alert"></p>`;
        const allDay = document.getElementById('evAllDay');
        const sync = () => {
            document.querySelectorAll('.ev-timed').forEach(x => { x.hidden = allDay.checked; });
            document.querySelectorAll('.ev-allday-only').forEach(x => { x.hidden = !allDay.checked; });
        };
        allDay.addEventListener('change', sync);
        sync();
        if (!dlg.open) dlg.showModal();
        document.getElementById('evTitle').focus();
    }

    function saveEvent(e) {
        e.preventDefault();
        const fd = new FormData(e.target), err = document.getElementById('evErr');
        const title = String(fd.get('title') || '').trim();
        const allDay = fd.get('allDay') === 'on';
        const date = fd.get('date'), endDate = fd.get('endDate') || '', start = fd.get('start'), end = fd.get('end');
        if (!title) { err.textContent = 'Add a title.'; return document.getElementById('evTitle').focus(); }
        if (!date) { err.textContent = 'Pick a date.'; return document.getElementById('evDate').focus(); }
        if (!allDay && toMin(end) <= toMin(start)) { err.textContent = 'The end time must be after the start time.'; return document.getElementById('evEnd').focus(); }
        if (allDay && endDate && endDate < date) { err.textContent = '"Until" must be on or after the date.'; return document.getElementById('evEndDate').focus(); }
        const P = A.P, id = document.getElementById('evDialog').dataset.id;
        const data = { title, kind: fd.get('kind') || 'other', allDay, date, endDate: allDay ? endDate : '', start: allDay ? '' : start, end: allDay ? '' : end, repeat: fd.get('repeat'), attendees: fd.getAll('att'), itemId: fd.get('itemId') || '', location: String(fd.get('location') || '').trim(), description: String(fd.get('description') || '') };
        if (id) Object.assign(P.events.find(x => x.id === id), data);
        else P.events.push({ id: PMT.uid('ev_'), createdAt: new Date().toISOString(), ...data });
        document.getElementById('evDialog').close();
        A.commit(`${id ? 'Updated' : 'Added'} event "${title}" on ${D.fmt(date)}`, id ? 'Event saved' : `Added "${title}"`, 'good');
    }

    function deleteEvent() {
        const id = document.getElementById('evDialog').dataset.id;
        const ev = A.P.events.find(x => x.id === id);
        if (!ev || !confirm(`Delete "${ev.title}"${ev.repeat !== 'none' ? ' and all its repeats' : ''}?`)) return;
        A.P.events = A.P.events.filter(x => x !== ev);
        document.getElementById('evDialog').close();
        A.commit(`Deleted event "${ev.title}"`, 'Event deleted');
    }

    // ─── .ics export (RFC 5545) ───
    A.action('calIcs', () => {
        const P = A.P;
        const escI = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const day = iso => iso.replace(/-/g, '');
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        // Fold long lines at 75 octets as the spec requires
        const fold = line => { const out = []; let rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); };
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PM Ready//Project Tool//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escI(P.name)}`];
        const vevent = (uid, props) => { lines.push('BEGIN:VEVENT', `UID:${uid}@pmready`, `DTSTAMP:${stamp}`, ...props, 'END:VEVENT'); };
        (P.events || []).forEach(ev => {
            const props = [`SUMMARY:${escI(ev.title)}`];
            if (ev.allDay) props.push(`DTSTART;VALUE=DATE:${day(ev.date)}`, `DTEND;VALUE=DATE:${day(D.addDays(ev.endDate || ev.date, 1))}`);
            else props.push(`DTSTART:${day(ev.date)}T${ev.start.replace(':', '')}00`, `DTEND:${day(ev.date)}T${ev.end.replace(':', '')}00`);
            if (ev.repeat === 'weekdays') props.push('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
            if (ev.repeat === 'weekly') props.push('RRULE:FREQ=WEEKLY');
            if (ev.repeat === 'monthly') props.push('RRULE:FREQ=MONTHLY');
            if (ev.location) props.push(`LOCATION:${escI(ev.location)}`);
            const who = (ev.attendees || []).map(A.member).filter(Boolean);
            const desc = [ev.description, who.length ? `Attendees: ${who.map(m => m.name).join(', ')}` : '', ev.itemId && A.item(ev.itemId) ? `Work item: ${A.keyOf(A.item(ev.itemId))} ${A.item(ev.itemId).title}` : ''].filter(Boolean).join('\n');
            if (desc) props.push(`DESCRIPTION:${escI(desc)}`);
            who.filter(m => m.email).forEach(m => props.push(`ATTENDEE;CN=${escI(m.name)}:mailto:${m.email}`));
            props.push(`CATEGORIES:${escI(KINDS[ev.kind]?.label || 'Other')}`);
            vevent(ev.id, props);
        });
        A.work().filter(i => i.dueDate).forEach(i => vevent(`due-${i.id}`, [`SUMMARY:${escI(`Due: ${A.keyOf(i)} ${i.title}`)}`, `DTSTART;VALUE=DATE:${day(i.dueDate)}`, `DTEND;VALUE=DATE:${day(D.addDays(i.dueDate, 1))}`, `DESCRIPTION:${escI(`Status: ${STATUS[i.status]}`)}`]));
        P.milestones.filter(m => m.targetDate).forEach(m => vevent(`ms-${m.id}`, [`SUMMARY:${escI(`◆ ${m.name}`)}`, `DTSTART;VALUE=DATE:${day(m.targetDate)}`, `DTEND;VALUE=DATE:${day(D.addDays(m.targetDate, 1))}`]));
        if (A.F.iterations) P.iterations.forEach(it => vevent(`it-${it.id}`, [`SUMMARY:${escI(it.name + (it.goal ? `: ${it.goal}` : ''))}`, `DTSTART;VALUE=DATE:${day(it.start)}`, `DTEND;VALUE=DATE:${day(D.addDays(it.end, 1))}`]));
        lines.push('END:VCALENDAR');
        const safe = P.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
        PMT.ui.download(`${safe}-calendar.ics`, lines.map(fold).join('\r\n') + '\r\n', 'text/calendar');
        toast('Calendar exported. Import the .ics file into Google Calendar or Outlook.', 'good');
    });
})();
