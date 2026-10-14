/* ===================================================================
   Storage layer.
   Every method returns a Promise, so this browser-only adapter can be
   replaced by a server API adapter later without changing any screen:

       PMT.store = ApiAdapter;   // list(), get(id), save(project), remove(id)

   Data lives in localStorage under one key, as { [projectId]: project }.
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};
    const KEY = 'pmt_projects_v1';

    function readAll() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
        catch (e) { return {}; }
    }
    function writeAll(all) {
        // Let quota/permission errors throw so the caller can tell the user the save failed
        localStorage.setItem(KEY, JSON.stringify(all));
    }

    const LocalAdapter = {
        async list() {
            return Object.values(readAll())
                .map(p => {
                    const work = p.items.filter(i => i.kind !== 'group');
                    return {
                        id: p.id, name: p.name, description: p.description, method: p.method,
                        template: p.template, updatedAt: p.updatedAt, members: p.members.length,
                        total: work.length, done: work.filter(i => i.status === 'done').length
                    };
                })
                .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        },
        async get(id) {
            const p = readAll()[id];
            return p ? JSON.parse(JSON.stringify(p)) : null;
        },
        async save(project) {
            const all = readAll();
            project.updatedAt = new Date().toISOString();
            all[project.id] = project;
            writeAll(all);
            return project;
        },
        async remove(id) {
            const all = readAll();
            delete all[id];
            writeAll(all);
        }
    };

    PMT.store = LocalAdapter;
    PMT.STORE_KEY = KEY;
    PMT.uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
})();
