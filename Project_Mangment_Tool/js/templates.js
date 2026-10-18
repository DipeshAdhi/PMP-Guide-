/* ===================================================================
   Prebuilt templates and project creation.
   Templates are methodology-neutral: each work item has a duration
   (for schedules) and an estimate (for iterations), dependencies,
   a suggested owner, and a MoSCoW priority. The chosen methodology
   decides which of these the app uses.

   Item tuple: [key, title, durationDays, dependsOnKeys, ownerIndex, moscow]
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};

    const TEMPLATES = [
        {
            id: 'blank', name: 'Blank project', icon: '📄',
            desc: 'Start empty and add your own work.',
            members: [['You', 'Project Manager']],
            groups: [], milestones: [], risks: []
        },
        {
            id: 'software', name: 'Mobile app launch', icon: '📱',
            desc: 'Discovery, design, build, beta test, and store release for a new app.',
            members: [['Alex', 'Product Owner'], ['Sam', 'Project Manager / Scrum Master'], ['Priya', 'Developer'], ['Leo', 'Developer'], ['Mina', 'Designer'], ['Omar', 'QA Tester']],
            groups: [
                ['Discovery', [['research', 'User research interviews', 4, [], 0, 'M'], ['req', 'Requirements and user stories', 3, ['research'], 0, 'M']]],
                ['Design', [['wire', 'Wireframes', 4, ['req'], 4, 'M'], ['visual', 'Visual design', 5, ['wire'], 4, 'S']]],
                ['Build', [['login', 'Sign-up and login', 5, ['visual'], 2, 'M'], ['feed', 'Home feed', 8, ['visual'], 3, 'M'], ['notif', 'Push notifications', 4, ['login'], 2, 'S'], ['settings', 'Settings screen', 3, ['login'], 3, 'C']]],
                ['Test', [['plan', 'Test plan', 2, ['req'], 5, 'S'], ['beta', 'Beta testing', 5, ['feed', 'notif', 'settings', 'plan'], 5, 'M'], ['fixes', 'Fix beta bugs', 4, ['beta'], 2, 'M']]],
                ['Launch', [['listing', 'App store listing', 2, ['visual'], 0, 'S'], ['release', 'Release to app stores', 1, ['fixes', 'listing'], 1, 'M']]]
            ],
            milestones: [['Requirements approved', ['req']], ['Design signed off', ['visual']], ['Feature complete', ['login', 'feed', 'notif', 'settings']], ['App launched', ['release']]],
            risks: [['App store review takes longer than planned', 3, 4, 1, 'Submit a test build early to learn the review process'], ['Key developer unavailable', 2, 4, 1, 'Pair on critical features so knowledge is shared'], ['Stakeholders keep adding features', 4, 3, 0, 'Route requests through the backlog or change process']]
        },
        {
            id: 'school', name: 'School management system', icon: '🏫',
            desc: 'Scholar Academy: attendance, grades, and a parent portal for a school.',
            members: [['Principal Sharma', 'Sponsor'], ['Priya', 'Project Manager'], ['Aarav', 'Business Analyst'], ['Mina', 'Developer'], ['Leo', 'Developer'], ['Omar', 'QA Tester']],
            groups: [
                ['Project management', [['charter', 'Project charter', 1, [], 1, 'M'], ['pmplan', 'Project management plan', 2, ['charter'], 1, 'M']]],
                ['Requirements', [['interviews', 'Stakeholder interviews', 3, ['charter'], 2, 'M'], ['reqdoc', 'Requirements document', 3, ['interviews'], 2, 'M']]],
                ['Design', [['wire', 'UI wireframes', 4, ['reqdoc'], 3, 'M'], ['db', 'Database schema', 3, ['reqdoc'], 4, 'M']]],
                ['Build', [['attendance', 'Attendance module', 5, ['wire', 'db'], 3, 'M'], ['grades', 'Grades module', 5, ['wire', 'db'], 4, 'M'], ['portal', 'Parent portal', 6, ['grades'], 3, 'S']]],
                ['Testing', [['integration', 'Integration testing', 4, ['attendance', 'grades', 'portal'], 5, 'M'], ['uat', 'User acceptance testing with teachers', 3, ['integration'], 5, 'M']]],
                ['Deployment', [['materials', 'Training materials', 3, ['wire'], 2, 'S'], ['training', 'Teacher training', 2, ['materials', 'uat'], 2, 'S'], ['golive', 'Go-live', 1, ['training'], 1, 'M']]]
            ],
            milestones: [['Requirements signed off', ['reqdoc']], ['Design approved', ['wire', 'db']], ['Build complete', ['attendance', 'grades', 'portal']], ['UAT signed off', ['uat']], ['System live', ['golive']]],
            risks: [['Teachers resist the new system', 3, 4, 2, 'Involve teachers in design reviews and training early'], ['Student data privacy breach', 2, 5, 4, 'Encrypt data and limit access by role'], ['SMS provider delays integration', 3, 2, 3, 'Choose the provider in the first week']]
        },
        {
            id: 'website', name: 'Website redesign', icon: '🌐',
            desc: 'Audit, design, content, build, and launch of a new company website.',
            members: [['Dana', 'Sponsor (Marketing lead)'], ['Sam', 'Project Manager'], ['Mina', 'UX Designer'], ['Leo', 'Front-end Developer'], ['Ravi', 'Content Writer'], ['Zoe', 'SEO Specialist']],
            groups: [
                ['Discovery', [['audit', 'Analytics and content audit', 3, [], 5, 'M'], ['workshop', 'Stakeholder workshop', 1, ['audit'], 1, 'M'], ['sitemap', 'Sitemap and requirements', 2, ['workshop'], 2, 'M']]],
                ['Design', [['wire', 'Wireframes', 4, ['sitemap'], 2, 'M'], ['visual', 'Visual design', 4, ['wire'], 2, 'M']]],
                ['Content', [['copy', 'Write page copy', 6, ['sitemap'], 4, 'M'], ['images', 'Photography and images', 3, ['visual'], 4, 'S']]],
                ['Build', [['cms', 'CMS setup', 3, ['sitemap'], 3, 'M'], ['templates', 'Page templates', 6, ['visual', 'cms'], 3, 'M'], ['migrate', 'Content migration', 4, ['templates', 'copy', 'images'], 4, 'M']]],
                ['Launch', [['redirects', 'SEO redirects', 2, ['migrate'], 5, 'S'], ['qa', 'QA and accessibility checks', 3, ['migrate'], 3, 'M'], ['live', 'Go live', 1, ['qa', 'redirects'], 1, 'M']]]
            ],
            milestones: [['Requirements agreed', ['sitemap']], ['Design approved', ['visual']], ['Content complete', ['copy', 'images']], ['Site live', ['live']]],
            risks: [['Content is late', 4, 3, 4, 'Start copywriting in parallel with design'], ['Search ranking drops after launch', 3, 4, 5, 'Map every old URL to a redirect'], ['Too many review rounds on design', 3, 3, 1, 'Agree on two review rounds up front']]
        },
        {
            id: 'event', name: 'Conference or event', icon: '🎤',
            desc: 'Venue, speakers, marketing, logistics, and the event day.',
            members: [['Grace', 'Event Sponsor'], ['Nadia', 'Event Manager'], ['Tom', 'Venue Coordinator'], ['Ivy', 'Marketing'], ['Ben', 'Speaker Liaison'], ['Kai', 'Volunteer Lead']],
            groups: [
                ['Planning', [['brief', 'Event brief and budget', 2, [], 1, 'M'], ['venue', 'Book the venue', 3, ['brief'], 2, 'M']]],
                ['Program', [['cfp', 'Call for speakers', 10, ['brief'], 4, 'M'], ['select', 'Select speakers', 3, ['cfp'], 4, 'M'], ['agenda', 'Publish the agenda', 2, ['select'], 4, 'M']]],
                ['Marketing', [['reg', 'Website and registration page', 4, ['venue'], 3, 'M'], ['email', 'Email campaign', 10, ['reg', 'agenda'], 3, 'S']]],
                ['Logistics', [['catering', 'Catering contract', 3, ['venue'], 2, 'M'], ['av', 'Audio-visual equipment', 2, ['venue'], 2, 'M'], ['volunteers', 'Volunteer briefing', 2, ['agenda'], 5, 'S']]],
                ['Event', [['day', 'Event day', 1, ['catering', 'av', 'volunteers', 'email'], 1, 'M'], ['survey', 'Post-event survey', 3, ['day'], 3, 'C']]]
            ],
            milestones: [['Venue booked', ['venue']], ['Agenda published', ['agenda']], ['Registration open', ['reg']], ['Event day', ['day']]],
            risks: [['Low registrations', 3, 4, 3, 'Early-bird pricing and partner promotion'], ['Keynote speaker cancels', 2, 4, 4, 'Keep a backup speaker confirmed'], ['Venue AV fails on the day', 2, 5, 2, 'Technical rehearsal the day before']]
        }
    ];

    // Jira-style project key from the name: "School system rollout" → "SSR", "Website" → "WEB"
    function projectKey(name) {
        const words = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
        const key = words.length > 1 ? words.slice(0, 4).map(w => w[0]).join('') : (words[0] || 'PRJ').slice(0, 3);
        return key.length >= 2 ? key : (key + 'X').slice(0, 2);
    }

    const pointsFor = days => days <= 1 ? 1 : days <= 2 ? 2 : days <= 3 ? 3 : days <= 5 ? 5 : days <= 8 ? 8 : 13;

    /**
     * members: [{ name, role, ti }] where ti = index in the template's member list (or null for added people)
     */
    function createProject({ name, description, startDate, templateId, method, members, tools = {} }) {
        const t = TEMPLATES.find(x => x.id === templateId) || TEMPLATES[0];
        const f = PMT.features(method, tools);
        const now = new Date().toISOString();
        const uid = PMT.uid;
        const p = {
            id: uid('p_'), version: 1, name, description: description || '', key: projectKey(name), nextNumber: 1,
            startDate: PMT.dates.nextWorkday(startDate), template: t.id, method,
            settings: { iterationDays: f.defaultIterationDays, wipLimit: 3, tools: { ...tools } },
            members: [], items: [], milestones: [], iterations: [], changes: [], risks: [], events: [], activity: [],
            createdAt: now, updatedAt: now
        };
        const byTemplateIndex = {};
        members.forEach(m => {
            const id = uid('m_');
            p.members.push({ id, name: m.name, role: m.role, email: (m.email || '').trim() });
            if (m.ti != null) byTemplateIndex[m.ti] = id;
        });

        const keyToId = {};
        let rank = 0;
        t.groups.forEach(([title, items], gi) => {
            const gid = uid('g_');
            p.items.push({ id: gid, kind: 'group', title, order: gi, raci: {} });
            items.forEach(([key], ii) => { keyToId[key] = uid('i_') + ii; });
            items.forEach(([key, itemTitle, duration, deps, owner, moscow], ii) => {
                p.items.push({
                    id: keyToId[key], kind: 'item', type: 'task', title: itemTitle, description: '',
                    parentId: gid, order: ii, rank: rank++, status: 'backlog',
                    duration, estimate: pointsFor(duration), moscow, deps: deps.map(d => keyToId[d]).filter(Boolean),
                    assigneeId: byTemplateIndex[owner] || null, iterationId: null, createdAt: now
                });
            });
        });

        // Number items in backlog order (KEY-1, KEY-2, ...) and give them real dates
        p.items.filter(i => i.kind !== 'group').sort((a, b) => a.rank - b.rank).forEach(i => { i.number = p.nextNumber++; });
        PMT.schedule.fillDates(p);

        // Milestone target dates are the baseline forecast at creation
        const sched = PMT.schedule.buildSchedule(p);
        t.milestones.forEach(([msName, keys]) => {
            const ms = { id: uid('ms_'), name: msName, itemIds: keys.map(k => keyToId[k]).filter(Boolean), targetDate: null };
            ms.targetDate = PMT.schedule.milestoneForecast(p, ms, sched);
            p.milestones.push(ms);
        });
        t.risks.forEach(([title, probability, impact, owner, response]) => {
            p.risks.push({ id: uid('r_'), title, probability, impact, ownerId: byTemplateIndex[owner] || null, response, status: 'open', createdAt: now });
        });
        // Example calendar entries for template projects: kickoff + weekly status meeting
        if (t.id !== 'blank') {
            const everyone = p.members.map(m => m.id);
            p.events.push(
                { id: uid('ev_'), title: 'Project kickoff', kind: 'meeting', allDay: false, date: p.startDate, endDate: '', start: '10:00', end: '11:00', repeat: 'none', attendees: everyone, itemId: '', location: '', description: 'Goals, roles, and how we will work.', createdAt: now },
                { id: uid('ev_'), title: 'Weekly status meeting', kind: 'meeting', allDay: false, date: PMT.dates.addWorkdays(p.startDate, 4), endDate: '', start: '15:00', end: '15:30', repeat: 'weekly', attendees: everyone, itemId: '', location: '', description: 'Progress, blockers, next steps.', createdAt: now }
            );
        }
        p.activity.push({ at: now, text: `Project created from "${t.name}" using ${PMT.methodName(method)}` });
        return p;
    }

    PMT.TEMPLATES = TEMPLATES;
    PMT.createProject = createProject;
    PMT.pointsFor = pointsFor;
    PMT.projectKey = projectKey;
})();
