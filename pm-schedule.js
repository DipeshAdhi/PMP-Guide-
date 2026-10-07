/* ===================================================================
   Shared example project + Critical Path Method calculation.
   Used by milestones.html, gantt.html and cpm.html so all three
   tools show the same Scholar Academy schedule.
   Durations are in working days. Day 0 = project start.
   =================================================================== */

const SCHOLAR_TASKS = [
    { id: 'A', name: 'Gather requirements', duration: 5, preds: [],         owner: 'Business Analyst' },
    { id: 'B', name: 'UI design',           duration: 4, preds: ['A'],      owner: 'Developer' },
    { id: 'C', name: 'Database design',     duration: 3, preds: ['A'],      owner: 'Developer' },
    { id: 'D', name: 'Front-end build',     duration: 6, preds: ['B'],      owner: 'Developer' },
    { id: 'E', name: 'Back-end build',      duration: 8, preds: ['C'],      owner: 'Developer' },
    { id: 'G', name: 'Training materials',  duration: 3, preds: ['B'],      owner: 'Business Analyst' },
    { id: 'F', name: 'Integration testing', duration: 4, preds: ['D', 'E'], owner: 'QA Tester' },
    { id: 'H', name: 'Go-live',             duration: 1, preds: ['F', 'G'], owner: 'Project Manager' }
];

// Milestones are zero-duration events reached when the listed tasks finish.
const SCHOLAR_MILESTONES = [
    { id: 'M0', name: 'Project kickoff',          after: [],         note: 'Charter signed, team assembled.' },
    { id: 'M1', name: 'Requirements signed off',  after: ['A'],      note: 'Principal approves the requirements document.' },
    { id: 'M2', name: 'Design approved',          after: ['B', 'C'], note: 'UI and database designs reviewed and accepted.' },
    { id: 'M3', name: 'Build complete',           after: ['D', 'E'], note: 'All code finished and unit tested.' },
    { id: 'M4', name: 'UAT signed off',           after: ['F'],      note: 'Teachers accept the system in user acceptance testing.' },
    { id: 'M5', name: 'System live',              after: ['H'],      note: 'Teachers start using the system in classes.' }
];

function cloneTasks(tasks) {
    return tasks.map(t => ({ ...t, preds: [...t.preds] }));
}

/**
 * Forward pass, backward pass, float, critical path.
 * Uses the convention common in PMP study: ES of first activity = 0, EF = ES + duration,
 * successor ES = max(predecessor EF). Total float = LS − ES.
 */
function computeCPM(input) {
    const tasks = cloneTasks(input);
    const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
    tasks.forEach(t => { t.succs = []; });
    tasks.forEach(t => t.preds.forEach(p => byId[p].succs.push(t.id)));

    // Topological order (Kahn's algorithm)
    const indeg = Object.fromEntries(tasks.map(t => [t.id, t.preds.length]));
    const queue = tasks.filter(t => indeg[t.id] === 0).map(t => t.id);
    const order = [];
    while (queue.length) {
        const id = queue.shift();
        order.push(id);
        byId[id].succs.forEach(s => { if (--indeg[s] === 0) queue.push(s); });
    }

    // Forward pass
    order.forEach(id => {
        const t = byId[id];
        t.es = t.preds.length ? Math.max(...t.preds.map(p => byId[p].ef)) : 0;
        t.ef = t.es + t.duration;
    });
    const projectEnd = Math.max(...tasks.map(t => t.ef));

    // Backward pass
    [...order].reverse().forEach(id => {
        const t = byId[id];
        t.lf = t.succs.length ? Math.min(...t.succs.map(s => byId[s].ls)) : projectEnd;
        t.ls = t.lf - t.duration;
    });

    // Float
    tasks.forEach(t => {
        t.float = t.ls - t.es;
        t.freeFloat = t.succs.length ? Math.min(...t.succs.map(s => byId[s].es)) - t.ef : projectEnd - t.ef;
        t.critical = t.float === 0;
    });

    return { tasks, byId, order, projectEnd };
}

// Every start-to-end path with its total duration (longest = critical path)
function allPaths(cpm) {
    const { tasks, byId } = cpm;
    const paths = [];
    const walk = (id, path) => {
        const next = [...path, id];
        const t = byId[id];
        if (!t.succs.length) {
            paths.push({ ids: next, length: next.reduce((s, x) => s + byId[x].duration, 0) });
            return;
        }
        t.succs.forEach(s => walk(s, next));
    };
    tasks.filter(t => !t.preds.length).forEach(t => walk(t.id, []));
    return paths.sort((a, b) => b.length - a.length);
}

function milestoneDay(milestone, cpm) {
    return milestone.after.length ? Math.max(...milestone.after.map(id => cpm.byId[id].ef)) : 0;
}
