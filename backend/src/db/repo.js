/* ===================================================================
   Repository: every database read and write the API makes.
   Routes call only these functions, never a driver directly, so moving
   to Postgres later means writing a new repo with the same functions.

   Tables (collections)
     users           { id, email, name, passwordHash, accountType, platformRole, disabled,
                       createdAt, lastLoginAt, lastActiveAt }
     sessions        { id (= sha256 of the cookie token), userId, createdAt, expiresAt, userAgent }
     companies       { id, name, createdBy, createdAt }
     companyMembers  { id, companyId, userId | null, email, role, status, addedBy, createdAt }
     projects        { id, companyId | null, ownerId, name, doc, version, createdAt, updatedAt, updatedBy, deletedAt }
     projectMembers  { id, projectId, userId | null, email, role, memberId, status, addedBy, createdAt }
     course          { id (= userId), data, modulesDone, updatedAt }
     audit           { id, at, actorId, action, target, meta }

   status 'pending' + userId null = added by email before that person
   registered; claimPending() links them when they sign up.
   Dates are ISO strings.
   =================================================================== */
import { randomUUID } from 'node:crypto';

export const newId = prefix => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const now = () => new Date().toISOString();
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createRepo({ cols }) {
    const { users, sessions, companies, companyMembers, projects, projectMembers, course, audit } = cols;

    return {
        // ─── Users ───
        users: {
            create: u => users.insert(u),
            byId: id => users.findOne({ id }),
            byEmail: email => users.findOne({ email: email.toLowerCase() }),
            update: (id, patch) => users.update({ id }, patch),
            async list({ q = '', skip = 0, limit = 50 } = {}) {
                const filter = q ? { $or: [{ email: { $regex: escapeRegex(q), $options: 'i' } }, { name: { $regex: escapeRegex(q), $options: 'i' } }] } : {};
                const [rows, total] = await Promise.all([users.find(filter, { sort: { createdAt: -1 }, skip, limit }), users.count(filter)]);
                return { rows, total };
            }
        },

        // ─── Sign-in sessions ───
        sessions: {
            create: s => sessions.insert(s),
            async get(id) {
                const s = await sessions.findOne({ id });
                return s && s.expiresAt > now() ? s : null;
            },
            remove: id => sessions.remove({ id }),
            removeForUser: (userId, exceptId) => sessions.removeMany(exceptId ? { userId, id: { $ne: exceptId } } : { userId })
        },

        // ─── Companies ───
        companies: {
            create: c => companies.insert(c),
            byId: id => companies.findOne({ id }),
            byIds: ids => ids.length ? companies.find({ id: { $in: ids } }) : [],
            update: (id, patch) => companies.update({ id }, patch),
            async list({ skip = 0, limit = 50 } = {}) {
                const [rows, total] = await Promise.all([companies.find({}, { sort: { createdAt: -1 }, skip, limit }), companies.count({})]);
                return { rows, total };
            }
        },
        companyMembers: {
            add: m => companyMembers.insert(m),
            byId: id => companyMembers.findOne({ id }),
            get: (companyId, userId) => companyMembers.findOne({ companyId, userId, status: 'active' }),
            byEmail: (companyId, email) => companyMembers.findOne({ companyId, email: email.toLowerCase() }),
            forCompany: companyId => companyMembers.find({ companyId }, { sort: { createdAt: 1 } }),
            forUser: userId => companyMembers.find({ userId, status: 'active' }),
            count: companyId => companyMembers.count({ companyId }),
            update: (id, patch) => companyMembers.update({ id }, patch),
            remove: id => companyMembers.remove({ id })
        },

        // ─── Projects (one document each, versioned) ───
        projects: {
            create: p => projects.insert(p),
            byId: id => projects.findOne({ id, deletedAt: null }),
            exists: async id => !!(await projects.findOne({ id })),
            byIds: ids => ids.length ? projects.find({ id: { $in: ids }, deletedAt: null }, { sort: { updatedAt: -1 } }) : [],
            forCompanies: companyIds => companyIds.length ? projects.find({ companyId: { $in: companyIds }, deletedAt: null }, { sort: { updatedAt: -1 } }) : [],
            // Saves only if nobody saved since `version`; returns false on a conflict
            async saveDoc(id, { doc, name, expectedVersion, userId }) {
                const matched = await projects.update({ id, version: expectedVersion, deletedAt: null }, { doc, name, updatedAt: now(), updatedBy: userId }, { version: 1 });
                return matched > 0;
            },
            update: (id, patch) => projects.update({ id }, patch),
            softDelete: (id, userId) => projects.update({ id }, { deletedAt: now(), updatedBy: userId }),
            async list({ skip = 0, limit = 50 } = {}) {
                const filter = { deletedAt: null };
                const [rows, total] = await Promise.all([
                    projects.find(filter, { sort: { updatedAt: -1 }, skip, limit, fields: ['id', 'name', 'companyId', 'ownerId', 'version', 'createdAt', 'updatedAt'] }),
                    projects.count(filter)
                ]);
                return { rows, total };
            },
            countForCompany: companyId => projects.count({ companyId, deletedAt: null })
        },
        projectMembers: {
            add: m => projectMembers.insert(m),
            byId: id => projectMembers.findOne({ id }),
            get: (projectId, userId) => projectMembers.findOne({ projectId, userId, status: 'active' }),
            byEmail: (projectId, email) => projectMembers.findOne({ projectId, email: email.toLowerCase() }),
            forProject: projectId => projectMembers.find({ projectId }, { sort: { createdAt: 1 } }),
            forUser: userId => projectMembers.find({ userId, status: 'active' }),
            count: projectId => projectMembers.count({ projectId }),
            update: (id, patch) => projectMembers.update({ id }, patch),
            remove: id => projectMembers.remove({ id })
        },

        // Someone registered: activate everything they were added to by email
        async claimPending(email, userId) {
            const filter = { email: email.toLowerCase(), status: 'pending', userId: null };
            const [c, p] = await Promise.all([
                companyMembers.updateMany(filter, { userId, status: 'active' }),
                projectMembers.updateMany(filter, { userId, status: 'active' })
            ]);
            return { companies: c, projects: p };
        },

        // ─── Course progress (one record per user) ───
        course: {
            get: userId => course.findOne({ id: userId }),
            async save(userId, data, modulesDone) {
                const rec = { data, modulesDone, updatedAt: now() };
                if (!(await course.update({ id: userId }, rec))) await course.insert({ id: userId, ...rec });
            }
        },

        audit: {
            add: (actorId, action, target, meta = {}) => audit.insert({ id: newId('a'), at: now(), actorId, action, target, meta }),
            recent: (limit = 30) => audit.find({}, { sort: { at: -1 }, limit })
        },

        // ─── Numbers for the admin dashboard ───
        async stats() {
            const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
            const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
            const [usersTotal, admins, companyAccounts, companiesTotal, projectsTotal, active7, learnerIds, projectUserIds, recent, courseRows] = await Promise.all([
                users.count({}),
                users.count({ platformRole: 'admin' }),
                users.count({ accountType: 'company' }),
                companies.count({}),
                projects.count({ deletedAt: null }),
                users.count({ lastActiveAt: { $gte: since7 } }),
                course.distinct('id', { modulesDone: { $gte: 0 } }),
                projectMembers.distinct('userId', { status: 'active' }),
                users.find({ createdAt: { $gte: since30 } }, { fields: ['createdAt'] }),
                course.find({}, { fields: ['modulesDone'] })
            ]);
            const learners = new Set(learnerIds);
            const projectUsers = new Set(projectUserIds.filter(Boolean));
            const both = [...learners].filter(id => projectUsers.has(id)).length;
            const byDay = {};
            for (let i = 29; i >= 0; i--) byDay[new Date(Date.now() - i * 864e5).toISOString().slice(0, 10)] = 0;
            recent.forEach(u => { const d = u.createdAt.slice(0, 10); if (d in byDay) byDay[d]++; });
            const courseModules = Array(9).fill(0);
            courseRows.forEach(r => { courseModules[Math.max(0, Math.min(8, r.modulesDone || 0))]++; });
            return {
                users: usersTotal, admins, companyAccounts, personalAccounts: usersTotal - companyAccounts,
                companies: companiesTotal, projects: projectsTotal, activeLast7Days: active7,
                courseLearners: learners.size, projectUsers: projectUsers.size, both,
                signupsLast30Days: Object.entries(byDay).map(([day, count]) => ({ day, count })),
                courseModulesDone: courseModules
            };
        }
    };
}
