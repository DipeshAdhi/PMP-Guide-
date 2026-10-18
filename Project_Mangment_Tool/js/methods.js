/* ===================================================================
   Methodologies.
   A project's method is either
     { mode: 'single', key: 'scrum' }
   or
     { mode: 'hybrid', preset: 'plan-scrum' | 'custom', caps: { planning, delivery, prioritisation, change, tracking } }
   Both are turned into the same five "area" choices (caps), and from
   those into the features the app switches on (PMT.features).
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};

    const AREAS = {
        planning: { label: 'Planning', options: {
            upfront: { label: 'Up-front plan', hint: 'Work breakdown (WBS), schedule, and milestones agreed at the start' },
            rolling: { label: 'Rolling backlog', hint: 'An ordered backlog, refined as you learn' } } },
        delivery: { label: 'Delivery', options: {
            phases: { label: 'Phases', hint: 'Work through the plan; no fixed iterations' },
            iterations: { label: 'Iterations', hint: 'Fixed-length sprints or timeboxes' },
            flow: { label: 'Continuous flow', hint: 'Pull work when there is capacity, with WIP limits' } } },
        prioritisation: { label: 'Prioritisation', options: {
            fixed: { label: 'Fixed scope', hint: 'Everything in the plan is delivered' },
            ordered: { label: 'Ordered backlog', hint: 'Most valuable first; the order decides' },
            moscow: { label: 'MoSCoW', hint: 'Must / Should / Could / Won\'t' } } },
        change: { label: 'Change', options: {
            formal: { label: 'Change requests', hint: 'Changes are proposed, assessed, and approved' },
            backlog: { label: 'Reprioritise', hint: 'New ideas go into the backlog and get ordered' } } },
        tracking: { label: 'Tracking', options: {
            schedule: { label: 'Schedule', hint: 'Gantt, critical path, milestone dates' },
            burndown: { label: 'Burndown', hint: 'Work remaining per iteration, velocity' },
            flow: { label: 'Flow', hint: 'Work in progress, cycle time, throughput' } } }
    };

    const METHODS = {
        predictive: { name: 'Predictive (Waterfall)', icon: '🌊', bestFor: 'Clear, stable requirements; fixed contracts; regulated work.',
            caps: { planning: 'upfront', delivery: 'phases', prioritisation: 'fixed', change: 'formal', tracking: 'schedule' } },
        scrum: { name: 'Scrum', icon: '🔄', bestFor: 'New products and changing requirements; a dedicated team.', iterationName: 'Sprint', iterationDays: 10,
            caps: { planning: 'rolling', delivery: 'iterations', prioritisation: 'ordered', change: 'backlog', tracking: 'burndown' } },
        kanban: { name: 'Kanban', icon: '🗂️', bestFor: 'Steady streams of work: support, maintenance, operations.',
            caps: { planning: 'rolling', delivery: 'flow', prioritisation: 'ordered', change: 'backlog', tracking: 'flow' } },
        xp: { name: 'Extreme Programming (XP)', icon: '⚡', bestFor: 'Software teams that want short iterations and strong engineering practice.', iterationName: 'Iteration', iterationDays: 5,
            caps: { planning: 'rolling', delivery: 'iterations', prioritisation: 'ordered', change: 'backlog', tracking: 'burndown' } },
        dsdm: { name: 'DSDM', icon: '🧭', bestFor: 'Fixed deadline and budget, where features must flex.', iterationName: 'Timebox', iterationDays: 10,
            caps: { planning: 'upfront', delivery: 'iterations', prioritisation: 'moscow', change: 'backlog', tracking: 'schedule' } }
    };

    const PRESETS = {
        'plan-scrum': { name: 'Predictive plan + Scrum delivery', desc: 'Agree scope, milestones, and budget up front; build in sprints.',
            caps: { planning: 'upfront', delivery: 'iterations', prioritisation: 'ordered', change: 'formal', tracking: 'schedule' } },
        'water-scrum-fall': { name: 'Water-Scrum-Fall', desc: 'Formal requirements and release at the ends, Scrum in the middle.',
            caps: { planning: 'upfront', delivery: 'iterations', prioritisation: 'fixed', change: 'formal', tracking: 'burndown' } },
        scrumban: { name: 'Scrumban', desc: 'A Scrum-style backlog with Kanban flow and WIP limits.',
            caps: { planning: 'rolling', delivery: 'flow', prioritisation: 'ordered', change: 'backlog', tracking: 'flow' } },
        'agile-gates': { name: 'Agile with phase gates', desc: 'Iterations with MoSCoW, plus formal milestones and change approval.',
            caps: { planning: 'upfront', delivery: 'iterations', prioritisation: 'moscow', change: 'formal', tracking: 'schedule' } }
    };

    function capsOf(method) {
        return method.mode === 'single' ? { ...METHODS[method.key].caps } : { ...method.caps };
    }

    function methodName(method) {
        if (method.mode === 'single') return METHODS[method.key].name;
        return `Hybrid: ${method.preset && PRESETS[method.preset] ? PRESETS[method.preset].name : 'custom'}`;
    }
    function methodIcon(method) {
        return method.mode === 'single' ? METHODS[method.key].icon : '🧬';
    }

    /* Tools a project manager can switch on for any project.
       `base` says whether the methodology already includes the tool; those are locked on. */
    const TOOLS = {
        wbs: { icon: '🌳', label: 'Work breakdown structure (WBS)', desc: 'Group work into deliverables with WBS codes, a tree view, and a RACI matrix.', base: c => c.planning === 'upfront' },
        iterations: { icon: '🔁', label: 'Sprints / iterations', desc: 'Fixed-length iterations with planning, a goal, burndown, and velocity.', base: c => c.delivery === 'iterations' },
        timeline: { icon: '🗓️', label: 'Timeline', desc: 'Sprints, milestones, and deliverables laid out on the calendar.', base: c => c.delivery === 'iterations' },
        schedule: { icon: '📊', label: 'Gantt chart & critical path', desc: 'Durations and dependencies, a forecast finish date, and the critical path.', base: c => c.planning === 'upfront' || c.tracking === 'schedule' },
        milestones: { icon: '🏁', label: 'Milestones', desc: 'Checkpoints with target dates, reached when their linked work is done.', base: c => c.planning === 'upfront' || c.tracking === 'schedule' },
        changes: { icon: '📝', label: 'Change requests', desc: 'Log, assess, and approve changes before they enter the plan.', base: c => c.change === 'formal' },
        moscow: { icon: '🎯', label: 'MoSCoW priorities', desc: 'Must / Should / Could / Won\'t on every item, with the 60% Must check.', base: c => c.prioritisation === 'moscow' },
        wip: { icon: '🚦', label: 'Work-in-progress limit', desc: 'Cap how many items can be in progress at once.', base: c => c.delivery === 'flow' }
    };

    // method + the project's extra tools ({ wbs: true, ... }) → what the app shows
    function features(method, extraTools = {}) {
        const c = capsOf(method);
        const single = method.mode === 'single' ? METHODS[method.key] : null;
        const locked = {}, tools = {};
        Object.entries(TOOLS).forEach(([k, t]) => {
            locked[k] = t.base(c);
            tools[k] = locked[k] || extraTools[k] === true;
        });
        const f = {
            caps: c, locked, tools,
            hierarchy: c.planning === 'upfront',   // the main work view is the WBS tree
            wbs: tools.wbs,                         // WBS codes/tree available (main view or add-on)
            iterations: tools.iterations,
            timeline: tools.timeline,
            flow: tools.wip,
            schedule: tools.schedule,
            milestones: tools.milestones,
            formalChange: tools.changes,
            moscow: tools.moscow,
            ranked: c.prioritisation === 'ordered',
            points: tools.iterations || c.tracking === 'burndown',
            flowMetrics: c.delivery === 'flow' || c.tracking === 'flow' || tools.wip,
            iterName: single?.iterationName || 'Sprint',
            defaultIterationDays: single?.iterationDays || 10
        };
        f.workLabel = f.hierarchy ? 'Work breakdown' : f.moscow ? 'Requirements' : 'Backlog';
        f.views = ['overview', 'work', 'board', 'calendar']
            .concat(f.iterations ? ['iterations'] : [])
            .concat(f.timeline ? ['timeline'] : [])
            .concat(f.schedule ? ['schedule'] : [])
            .concat(f.milestones ? ['milestones'] : [])
            .concat(['team'])
            .concat(f.formalChange ? ['changes'] : [])
            .concat(['risks', 'settings']);
        return f;
    }

    // Checklist of tools: methodology ones locked on, the rest toggleable
    function renderToolPicker(el, method, initial, onChange) {
        const value = { ...(initial || {}) };
        function draw() {
            const f = features(method, value);
            el.innerHTML = `<div class="tool-list">${Object.entries(TOOLS).map(([k, t]) => `
                <label class="tool-row ${f.locked[k] ? 'locked' : ''}">
                    <span class="tool-ico" aria-hidden="true">${t.icon}</span>
                    <span class="tool-text"><strong>${t.label}</strong><small>${t.desc}</small></span>
                    ${f.locked[k] ? `<span class="pill">Included with ${methodName(method).replace(/^Hybrid: /, '')}</span>` : ''}
                    <input type="checkbox" class="switch" data-tool="${k}" ${f.tools[k] ? 'checked' : ''} ${f.locked[k] ? 'disabled' : ''} aria-label="${t.label}">
                </label>`).join('')}</div>`;
            el.querySelectorAll('[data-tool]').forEach(cb => cb.addEventListener('change', () => {
                value[cb.dataset.tool] = cb.checked;
                // Sprints are much more useful on a timeline, so switch it on alongside
                if (cb.dataset.tool === 'iterations' && cb.checked && value.timeline === undefined) value.timeline = true;
                draw();
                el.querySelector(`[data-tool="${cb.dataset.tool}"]`).focus();
                onChange && onChange({ ...value });
            }));
        }
        draw();
        return { get: () => ({ ...value }) };
    }

    // One line per area, for summaries
    function describe(method) {
        const c = capsOf(method);
        return Object.entries(AREAS).map(([k, a]) => ({ area: a.label, choice: a.options[c[k]].label, hint: a.options[c[k]].hint }));
    }

    // ─── Picker UI (used by the new-project wizard and settings) ───
    const VIEW_LABELS = { overview: 'Overview', work: 'Work', board: 'Board', calendar: 'Calendar', iterations: 'Iterations', timeline: 'Timeline', schedule: 'Gantt chart', milestones: 'Milestones', team: 'Team', changes: 'Change requests', risks: 'Risks', settings: 'Settings' };

    function renderMethodPicker(el, initial, onChange) {
        let value = JSON.parse(JSON.stringify(initial || { mode: 'single', key: 'scrum' }));
        const emit = () => onChange && onChange(JSON.parse(JSON.stringify(value)));

        function draw() {
            const f = features(value);
            const caps = capsOf(value);
            el.innerHTML = `
                <div class="seg" role="radiogroup" aria-label="Single or hybrid">
                    <button type="button" role="radio" aria-checked="${value.mode === 'single'}" data-mode="single"><strong>One methodology</strong><small>Follow a single approach</small></button>
                    <button type="button" role="radio" aria-checked="${value.mode === 'hybrid'}" data-mode="hybrid"><strong>Hybrid</strong><small>Mix approaches area by area</small></button>
                </div>
                ${value.mode === 'single' ? `
                <div class="choice-grid" role="radiogroup" aria-label="Methodology">
                    ${Object.entries(METHODS).map(([k, m]) => `
                        <button type="button" class="choice" role="radio" aria-checked="${value.key === k}" data-key="${k}">
                            <span class="choice-icon">${m.icon}</span><strong>${m.name}</strong><small>${m.bestFor}</small>
                        </button>`).join('')}
                </div>` : `
                <div class="choice-grid" role="radiogroup" aria-label="Hybrid preset">
                    ${Object.entries(PRESETS).map(([k, p]) => `
                        <button type="button" class="choice" role="radio" aria-checked="${value.preset === k}" data-preset="${k}">
                            <span class="choice-icon">🧬</span><strong>${p.name}</strong><small>${p.desc}</small>
                        </button>`).join('')}
                </div>
                <div class="areas">
                    <p class="muted small">Start from a preset, then adjust any area${value.preset === 'custom' ? ' (custom mix)' : ''}:</p>
                    ${Object.entries(AREAS).map(([k, a]) => `
                        <div class="area-row"><span class="area-label">${a.label}</span>
                            <div class="seg small" role="radiogroup" aria-label="${a.label}">${Object.entries(a.options).map(([ok, o]) => `
                                <button type="button" role="radio" aria-checked="${caps[k] === ok}" data-area="${k}" data-opt="${ok}" title="${o.hint}">${o.label}</button>`).join('')}
                            </div></div>`).join('')}
                </div>`}
                <div class="preview">
                    <strong>Your project will include:</strong>
                    <div class="chips">${f.views.filter(v => v !== 'settings').map(v => `<span class="chip">${v === 'work' ? f.workLabel : v === 'iterations' ? f.iterName + 's' : VIEW_LABELS[v]}</span>`).join('')}</div>
                    <ul class="muted small">${describe(value).map(d => `<li><strong>${d.area}:</strong> ${d.choice}. ${d.hint}.</li>`).join('')}</ul>
                </div>`;

            el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
                if (b.dataset.mode === value.mode) return;
                value = b.dataset.mode === 'single'
                    ? { mode: 'single', key: 'scrum' }
                    : { mode: 'hybrid', preset: 'plan-scrum', caps: { ...PRESETS['plan-scrum'].caps } };
                draw(); emit();
            });
            el.querySelectorAll('[data-key]').forEach(b => b.onclick = () => { value = { mode: 'single', key: b.dataset.key }; draw(); emit(); });
            el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { value = { mode: 'hybrid', preset: b.dataset.preset, caps: { ...PRESETS[b.dataset.preset].caps } }; draw(); emit(); });
            el.querySelectorAll('[data-area]').forEach(b => b.onclick = () => {
                value.caps[b.dataset.area] = b.dataset.opt;
                const match = Object.entries(PRESETS).find(([, p]) => Object.keys(AREAS).every(k => p.caps[k] === value.caps[k]));
                value.preset = match ? match[0] : 'custom';
                draw(); emit();
            });
        }
        draw();
        return { get: () => JSON.parse(JSON.stringify(value)) };
    }

    PMT.AREAS = AREAS;
    PMT.METHODS = METHODS;
    PMT.PRESETS = PRESETS;
    PMT.VIEW_LABELS = VIEW_LABELS;
    PMT.capsOf = capsOf;
    PMT.methodName = methodName;
    PMT.methodIcon = methodIcon;
    PMT.features = features;
    PMT.describeMethod = describe;
    PMT.renderMethodPicker = renderMethodPicker;
    PMT.TOOLS = TOOLS;
    PMT.renderToolPicker = renderToolPicker;
})();
