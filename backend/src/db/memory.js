// In-memory driver with the same Collection API as mongo.js.
// Used by the tests and for quick demos (DB_DRIVER=memory); data is lost on restart.
// Supports the small filter language repo.js uses: equality, null (= missing),
// { $in }, { $ne }, { $gte }, { $lt }, { $regex, $options }, and $or.

const clone = v => structuredClone(v);

function matches(rec, filter = {}) {
    return Object.entries(filter).every(([key, cond]) => {
        if (key === '$or') return cond.some(f => matches(rec, f));
        const v = rec[key];
        if (cond === null) return v === null || v === undefined;
        if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
            return Object.entries(cond).every(([op, x]) => {
                if (op === '$in') return x.includes(v);
                if (op === '$ne') return x === null ? v !== null && v !== undefined : v !== x;
                if (op === '$gte') return v >= x;
                if (op === '$lt') return v < x;
                if (op === '$regex') return new RegExp(x, cond.$options || '').test(v ?? '');
                if (op === '$options') return true;
                throw new Error(`memory driver: unsupported operator ${op}`);
            });
        }
        return v === cond;
    });
}

function collection() {
    const rows = new Map();
    const all = filter => [...rows.values()].filter(r => matches(r, filter));
    return {
        async insert(rec) {
            if (rows.has(rec.id)) throw Object.assign(new Error('duplicate id'), { code: 11000 });
            rows.set(rec.id, clone(rec));
            return rec;
        },
        async findOne(filter) { const r = all(filter)[0]; return r ? clone(r) : null; },
        async find(filter, { sort, skip = 0, limit } = {}) {
            let list = all(filter);
            if (sort) {
                const [[k, dir]] = Object.entries(sort);
                list.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
            }
            list = list.slice(skip, limit ? skip + limit : undefined);
            return list.map(clone);
        },
        async count(filter) { return all(filter).length; },
        async distinct(field, filter) { return [...new Set(all(filter).map(r => r[field]))]; },
        async update(filter, set, inc) {
            const r = all(filter)[0];
            if (!r) return 0;
            Object.assign(r, clone(set || {}));
            for (const [k, n] of Object.entries(inc || {})) r[k] = (r[k] || 0) + n;
            return 1;
        },
        async updateMany(filter, set) { const list = all(filter); list.forEach(r => Object.assign(r, clone(set))); return list.length; },
        async remove(filter) { const r = all(filter)[0]; if (!r) return 0; rows.delete(r.id); return 1; },
        async removeMany(filter) { const list = all(filter); list.forEach(r => rows.delete(r.id)); return list.length; }
    };
}

export async function connectMemory() {
    const names = ['users', 'sessions', 'companies', 'companyMembers', 'projects', 'projectMembers', 'course', 'audit', 'emails', 'tokens'];
    const cols = Object.fromEntries(names.map(n => [n, collection()]));
    return { cols, close: async () => {}, ping: async () => ({ ok: 1 }) };
}
