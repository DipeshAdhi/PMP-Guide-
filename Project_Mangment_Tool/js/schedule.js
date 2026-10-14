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

    // Schedule every work item that has a duration, from the project start date
    function buildSchedule(project) {
        const items = project.items.filter(i => i.kind !== 'group' && Number(i.duration) > 0);
        const ids = new Set(items.map(i => i.id));
        const r = cpm(items.map(i => ({ id: i.id, duration: Math.max(1, Math.round(Number(i.duration))), preds: (i.deps || []).filter(d => ids.has(d)) })));
        const start = nextWorkday(project.startDate);
        Object.values(r.byId).forEach(t => {
            t.startDate = addWorkdays(start, t.es);
            t.endDate = addWorkdays(start, t.ef - 1);
        });
        r.start = start;
        r.finishDate = r.end ? addWorkdays(start, r.end - 1) : start;
        return r;
    }

    function milestoneForecast(project, milestone, sched) {
        const ids = (milestone.itemIds || []).filter(id => sched.byId[id]);
        if (!ids.length) return null;
        return addWorkdays(sched.start, Math.max(...ids.map(id => sched.byId[id].ef)) - 1);
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

    PMT.dates = { toDate, toISO, todayISO, nextWorkday, addWorkdays, workdayIndex, workdaysInRange, fmt };
    PMT.schedule = { cpm, buildSchedule, milestoneForecast, wouldCycle };
})();
