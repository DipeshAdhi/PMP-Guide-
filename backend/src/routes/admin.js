// Platform admin (our company): numbers and lists of users, companies, projects.
// Admins see names, counts and dates, not the contents of people's projects.
import { Router } from 'express';
import { requireAdmin, publicUser } from '../auth.js';
import { bad, HttpError } from '../security.js';

const page = req => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const p = Math.max(1, Number(req.query.page) || 1);
    return { limit, skip: (p - 1) * limit, page: p };
};

export function adminRoutes(repo) {
    const r = Router();
    r.use(requireAdmin);

    r.get('/stats', async (req, res) => res.json(await repo.stats()));

    r.get('/users', async (req, res) => {
        const { limit, skip, page: p } = page(req);
        const { rows, total } = await repo.users.list({ q: String(req.query.q || '').slice(0, 100), skip, limit });
        const users = await Promise.all(rows.map(async u => {
            const [cms, pms, course] = await Promise.all([repo.companyMembers.forUser(u.id), repo.projectMembers.forUser(u.id), repo.course.get(u.id)]);
            return { ...publicUser(u), disabled: !!u.disabled, lastLoginAt: u.lastLoginAt, lastActiveAt: u.lastActiveAt,
                companies: cms.length, projects: pms.length, courseModulesDone: course ? course.modulesDone : null };
        }));
        res.json({ users, total, page: p, limit });
    });

    // Disable/enable an account or make someone a platform admin
    r.patch('/users/:id', async (req, res) => {
        const u = await repo.users.byId(req.params.id);
        if (!u) throw new HttpError(404, 'not_found', 'User not found.');
        if (u.id === req.user.id) throw bad('You can\'t change your own admin account here.');
        const patch = {};
        if (typeof req.body.disabled === 'boolean') patch.disabled = req.body.disabled;
        if (req.body.platformRole !== undefined) {
            if (!['admin', 'user'].includes(req.body.platformRole)) throw bad('Role must be admin or user.');
            patch.platformRole = req.body.platformRole;
        }
        await repo.users.update(u.id, patch);
        if (patch.disabled) await repo.sessions.removeForUser(u.id);
        await repo.audit.add(req.user.id, 'admin.user.update', u.id, patch);
        res.json({ user: { ...publicUser({ ...u, ...patch }), disabled: !!(patch.disabled ?? u.disabled) } });
    });

    r.get('/companies', async (req, res) => {
        const { limit, skip, page: p } = page(req);
        const { rows, total } = await repo.companies.list({ skip, limit });
        const companies = await Promise.all(rows.map(async c => {
            const [members, projects, creator] = await Promise.all([repo.companyMembers.count(c.id), repo.projects.countForCompany(c.id), repo.users.byId(c.createdBy)]);
            return { id: c.id, name: c.name, createdAt: c.createdAt, createdBy: creator?.email || '', members, projects };
        }));
        res.json({ companies, total, page: p, limit });
    });

    r.get('/projects', async (req, res) => {
        const { limit, skip, page: p } = page(req);
        const { rows, total } = await repo.projects.list({ skip, limit });
        const projects = await Promise.all(rows.map(async pr => {
            const [owner, company, people] = await Promise.all([repo.users.byId(pr.ownerId), pr.companyId ? repo.companies.byId(pr.companyId) : null, repo.projectMembers.count(pr.id)]);
            return { id: pr.id, name: pr.name, owner: owner?.email || '', company: company?.name || null, people, createdAt: pr.createdAt, updatedAt: pr.updatedAt };
        }));
        res.json({ projects, total, page: p, limit });
    });

    r.get('/audit', async (req, res) => {
        const rows = await repo.audit.recent(50);
        const actors = await Promise.all(rows.map(a => a.actorId ? repo.users.byId(a.actorId) : null));
        res.json({ events: rows.map((a, i) => ({ at: a.at, actor: actors[i]?.email || '', action: a.action, target: a.target, meta: a.meta })) });
    });

    return r;
}
