/* ===================================================================
   Dates (working days, Mon–Fri) and the critical path method.
   Dates are ISO strings 'YYYY-MM-DD', handled in UTC to avoid
   time-zone shifts.
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};
    const DAY = 86400000;

    const toDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const toISO = d => d.toISOString().slice(0, 10);
    const isWeekend = d => { const w = d.getUTCDay(); return w === 0 || w === 6; };

    function todayISO() {
        const n = new Date();
        return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
    }
    function nextWorkday(iso) {
        let d = toDate(iso);
        while (isWeekend(d)) d = new Date(d.getTime() + DAY);
        return toISO(d);
    }
    // The workday that is n workdays after `iso` (n = 0 → iso itself, moved off a weekend)
    function addWorkdays(iso, n) {
        let d = toDate(nextWorkday(iso));
        let left = n;
        while (left > 0) {
            d = new Date(d.getTime() + DAY);
            if (!isWeekend(d)) left--;
        }
        return toISO(d);
    }
    // Workday index of `iso` counted from `startIso` (start = 0). Weekends count as the previous workday.
    function workdayIndex(startIso, iso) {
        const start = toDate(nextWorkday(startIso)), end = toDate(iso);
        if (end < start) return -1;
        let n = -1;
        for (let d = start; d <= end; d = new Date(d.getTime() + DAY)) if (!isWeekend(d)) n++;
        return Math.max(n, 0);
    }
    function workdaysInRange(startIso, endIso) {
        const out = [];
        for (let d = toDate(startIso); d <= toDate(endIso); d = new Date(d.getTime() + DAY)) if (!isWeekend(d)) out.push(toISO(d));
        return out;
    }
    function fmt(iso, opts = { day: 'numeric', month: 'short' }) {
        return iso ? toDate(iso).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' }) : '—';
    }

    // ─── Critical path ───
    function cpm(tasks) {
        const byId = {};
        tasks.forEach(t => { byId[t.id] = { ...t, preds: t.preds.filter(p => p !== t.id), succs: [] }; });
        Object.values(byId).forEach(t => { t.preds = t.preds.filter(p => byId[p]); t.preds.forEach(p => byId[p].succs.push(t.id)); });

        const indeg = {}; Object.values(byId).forEach(t => { indeg[t.id] = t.preds.length; });
        const queue = Object.keys(byId).filter(id => indeg[id] === 0);
        const order = [];
        while (queue.length) {
            const id = queue.shift();
            order.push(id);
            byId[id].succs.forEach(s => { if (--indeg[s] === 0) queue.push(s); });
        }
        const cycle = order.length < tasks.length;
        // Anything stuck in a cycle is scheduled as if it had no predecessors
        Object.keys(byId).filter(id => !order.includes(id)).forEach(id => { byId[id].preds = []; order.push(id); });

        order.forEach(id => {
            const t = byId[id];
            t.es = t.preds.length ? Math.max(...t.preds.map(p => byId[p].ef ?? 0)) : 0;
            t.ef = t.es + t.duration;
        });
        const end = order.length ? Math.max(...order.map(id => byId[id].ef)) : 0;
        [...order].reverse().forEach(id => {
            const t = byId[id];
            const succ = t.succs.filter(s => byId[s].ls != null);
            t.lf = succ.length ? Math.min(...succ.map(s => byId[s].ls)) : end;
            t.ls = t.lf - t.duration;
            t.float = t.ls - t.es;
            t.critical = t.float === 0;
        });
        return { byId, order, end, cycle };
    }

    const addDays = (iso, n) => toISO(new Date(toDate(iso).getTime() + n * DAY));
    const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
    // Working days an item spans (at least 1)
    const spanDays = (start, due) => Math.max(1, workdaysInRange(start, due).length);

    /**
     * Schedule for every work item that has dates or a duration.
     * Dates set by the user (startDate + dueDate) win. Items without dates are
     * placed by the critical path method from the project start and their dependencies.
     * Critical path and float come from durations + dependencies.
     */
    function buildSchedule(project) {
        const start = nextWorkday(project.startDate);
        const items = project.items.filter(i => i.kind !== 'group' && ((i.startDate && i.dueDate) || Number(i.duration) > 0));
        const ids = new Set(items.map(i => i.id));
        const durationOf = i => (i.startDate && i.dueDate) ? spanDays(i.startDate, i.dueDate) : Math.max(1, Math.round(Number(i.duration)));
        const r = cpm(items.map(i => ({ id: i.id, duration: durationOf(i), preds: (i.deps || []).filter(d => ids.has(d)) })));
        items.forEach(i => {
            const t = r.byId[i.id];
            if (i.startDate && i.dueDate) { t.startDate = i.startDate; t.endDate = i.dueDate; t.fixed = true; }
            else { t.startDate = addWorkdays(start, t.es); t.endDate = addWorkdays(start, t.ef - 1); }
        });
        const all = Object.values(r.byId);
        r.start = start;
        r.finishDate = all.length ? all.map(t => t.endDate).sort().pop() : start;
        // Finish-to-start dependencies that the dates break
        r.conflicts = [];
        all.forEach(t => t.preds.forEach(p => { if (t.startDate <= r.byId[p].endDate) r.conflicts.push({ from: p, to: t.id }); }));
        return r;
    }

    // A milestone is forecast to be reached when its last linked item ends
    function milestoneForecast(project, milestone, sched) {
        const ends = (milestone.itemIds || []).filter(id => sched.byId[id]).map(id => sched.byId[id].endDate);
        return ends.length ? ends.sort().pop() : null;
    }

    // Give every scheduled item explicit dates (used when creating projects and switching the Gantt on)
    function fillDates(project) {
        const s = buildSchedule(project);
        project.items.forEach(i => {
            const t = s.byId[i.id];
            if (t && !(i.startDate && i.dueDate)) { i.startDate = t.startDate; i.dueDate = t.endDate; }
        });
    }

    // Move items so every dependency is respected (successor starts the next working day), keeping their length
    function resolveConflicts(project) {
        const byId = Object.fromEntries(project.items.map(i => [i.id, i]));
        let moved = 0;
        for (let pass = 0; pass < 50; pass++) {
            const s = buildSchedule(project);
            if (!s.conflicts.length) break;
            const order = s.order;
            const c = s.conflicts.sort((a, b) => order.indexOf(a.to) - order.indexOf(b.to))[0];
            const it = byId[c.to];
            const len = s.byId[c.to].duration;
            const latestPred = s.byId[c.to].preds.map(p => s.byId[p].endDate).sort().pop();
            it.startDate = addWorkdays(latestPred, 1);
            it.dueDate = addWorkdays(it.startDate, len - 1);
            moved++;
        }
        return moved;
    }

    // Would making `itemId` depend on `depId` create a loop?
    function wouldCycle(items, itemId, depId) {
        const byId = Object.fromEntries(items.map(i => [i.id, i]));
        const stack = [depId], seen = new Set();
        while (stack.length) {
            const cur = stack.pop();
            if (cur === itemId) return true;
            if (seen.has(cur)) continue;
            seen.add(cur);
            (byId[cur]?.deps || []).forEach(d => stack.push(d));
        }
        return false;
    }

    PMT.dates = { toDate, toISO, todayISO, nextWorkday, addWorkdays, addDays, daysBetween, spanDays, workdayIndex, workdaysInRange, fmt };
    PMT.schedule = { cpm, buildSchedule, milestoneForecast, fillDates, resolveConflicts, wouldCycle };
})();
