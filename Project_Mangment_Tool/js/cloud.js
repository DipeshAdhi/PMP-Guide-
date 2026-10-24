/* ===================================================================
   Server mode for the Project Tool.
   Load after store.js and ../assets/js/account.js. Sets PMT.ready:

     • PM Ready server found → requires sign-in, swaps PMT.store for the
       API adapter (same list/get/save/remove contract), sets PMT.cloud
     • no server (GitHub Pages, file://) → nothing changes, projects stay
       in this browser

   Pages wait for PMT.ready before reading projects.
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};
    const Acc = window.PMAccount;
    PMT.cloud = false;

    // Per open project: server version (for conflict checks), my role, company
    const meta = {};
    const queues = {};

    async function create(p) {
        const companyId = p.companyId || null;
        delete p.companyId;
        let r;
        try {
            r = await Acc.api('POST', '/projects', { doc: p, companyId });
        } catch (e) {
            // That id is used by another project (e.g. importing a shared export): take a new one
            if (e.code !== 'id_taken') throw e;
            p.id = PMT.uid('p_');
            r = await Acc.api('POST', '/projects', { doc: p, companyId });
        }
        meta[p.id] = { version: r.version, role: r.role, companyId };
        p.updatedAt = r.updatedAt;
        return p;
    }
    async function update(p) {
        const m = meta[p.id];
        const r = await Acc.api('PUT', `/projects/${encodeURIComponent(p.id)}`, { doc: p, version: m.version });
        m.version = r.version;
        p.updatedAt = r.updatedAt;
        return p;
    }

    const ApiAdapter = {
        async list() { return (await Acc.api('GET', '/projects')).projects; },
        async get(id) {
            try {
                const r = await Acc.api('GET', `/projects/${encodeURIComponent(id)}`);
                meta[id] = { version: r.version, role: r.role, companyId: r.companyId, companyName: r.companyName };
                return r.doc;
            } catch (e) {
                if (e.status === 404) return null;
                throw e;
            }
        },
        // Saves for one project run one after another, so each sends the latest version
        save(p) {
            const run = () => (meta[p.id] ? update(p) : create(p));
            const q = (queues[p.id] || Promise.resolve()).catch(() => {}).then(run);
            queues[p.id] = q;
            return q;
        },
        async remove(id) {
            await Acc.api('DELETE', `/projects/${encodeURIComponent(id)}`);
            delete meta[id];
        },
        meta: id => meta[id] || null,
        // Has someone else saved since we loaded? → { version, updatedBy } or null
        async remoteVersion(id) {
            const m = meta[id];
            if (!m) return null;
            const r = await Acc.api('GET', `/projects/${encodeURIComponent(id)}/version`);
            return r.version > m.version ? r : null;
        },
        // Who can open the project
        access: {
            list: id => Acc.api('GET', `/projects/${encodeURIComponent(id)}/access`),
            add: (id, body) => Acc.api('POST', `/projects/${encodeURIComponent(id)}/access`, body),
            update: (id, aid, body) => Acc.api('PATCH', `/projects/${encodeURIComponent(id)}/access/${aid}`, body),
            remove: (id, aid) => Acc.api('DELETE', `/projects/${encodeURIComponent(id)}/access/${aid}`),
            transfer: (id, aid) => Acc.api('POST', `/projects/${encodeURIComponent(id)}/transfer`, { accessId: aid })
        }
    };

    PMT.ROLE_LABELS = { owner: 'Owner', manager: 'Manager', member: 'Member', viewer: 'Viewer' };
    PMT.ROLE_HELP = {
        owner: 'Everything, including deleting the project',
        manager: 'Edit everything and manage who has access',
        member: 'Edit work items and plans',
        viewer: 'See and download, no changes'
    };

    // Account menu (name → My account, Admin, Sign out); safe to re-render
    PMT.userMenuHtml = () => {
        if (!PMT.cloud) return '';
        const { esc, initials } = PMT.ui;
        const u = PMT.user, root = Acc.ROOT;
        return `<div class="user-chip"><details><summary><span class="avatar" style="background:#FFB700;color:#1E2A38">${esc(initials(u.name))}</span><span>${esc(u.name)}</span></summary>
            <div class="menu"><div class="who">${esc(u.email)}</div>
            <a href="${root}account/index.html">My account &amp; companies</a>
            <a href="${root}learn/index.html">Course</a>
            ${u.platformRole === 'admin' ? `<a href="${root}admin/index.html">Admin dashboard</a>` : ''}
            <button type="button" data-signout>Sign out</button></div></details></div>`;
    };
    PMT.userMenu = el => { if (el) el.innerHTML = PMT.userMenuHtml(); };
    document.addEventListener('click', e => {
        if (e.target.closest('[data-signout]')) { Acc.signOut(); return; }
        document.querySelectorAll('.user-chip details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    });

    PMT.ready = (async () => {
        if (!Acc || !await Acc.available()) return { cloud: false };
        const me = await Acc.me();
        if (!me) { location.replace(Acc.signInUrl()); return new Promise(() => {}); }
        PMT.cloud = true;
        PMT.user = me.user;
        PMT.companies = me.companies || [];
        PMT.localStore = PMT.store;
        PMT.store = ApiAdapter;
        return { cloud: true, user: me.user };
    })();
})();
