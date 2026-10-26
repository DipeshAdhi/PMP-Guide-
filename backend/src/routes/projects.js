// Projects: list, create, open, save (with version check), delete, and who has access
import { Router } from 'express';
import { requireUser, avatarUrl } from '../auth.js';
import { requireProject, requireCompany, canGrant, PROJECT_ROLES } from '../permissions.js';
import { EMAIL, cleanEmail, bad, HttpError, rateLimit } from '../security.js';
import { newId } from '../db/repo.js';
import { notifyMember, accountReady } from '../invites.js';

const now = () => new Date().toISOString();
const ID = /^[A-Za-z0-9_-]{4,64}$/;

// The project document is the browser's Project object; check its basic shape
function checkDoc(doc) {
    const ok = doc && typeof doc === 'object' && !Array.isArray(doc)
        && typeof doc.name === 'string' && doc.name.trim() && doc.name.length <= 200
        && doc.method && typeof doc.method === 'object'
        && Array.isArray(doc.items) && Array.isArray(doc.members);
    if (!ok) throw bad('This is not a valid project.', 'invalid_project');
}

function summary(p, role, companies) {
    const work = (p.doc.items || []).filter(i => i.kind !== 'group');
    return {
        id: p.id, name: p.name, description: p.doc.description || '', method: p.doc.method, template: p.doc.template,
        members: (p.doc.members || []).length, total: work.length, done: work.filter(i => i.status === 'done').length,
        updatedAt: p.updatedAt, role, companyId: p.companyId || null, companyName: companies.find(c => c.id === p.companyId)?.name || null
    };
}

export function projectRoutes(repo, mailer) {
    const r = Router();
    r.use(requireUser);
    const inviteLimit = rateLimit({ windowMs: 60 * 60e3, max: 60, key: req => `invite|${req.user.id}` });
    async function target(project) {
        const company = project.companyId ? await repo.companies.byId(project.companyId) : null;
        return { type: 'project', id: project.id, name: project.name, company: company?.name || null };
    }

    async function accessList(projectId, meId) {
        const ms = await repo.projectMembers.forProject(projectId);
        const users = await Promise.all(ms.map(m => m.userId ? repo.users.byId(m.userId) : null));
        return ms.map((m, i) => ({ id: m.id, email: m.email, name: users[i]?.name || '', avatarUrl: avatarUrl(users[i]), role: m.role, status: m.status, memberId: m.memberId || null, isYou: m.userId === meId }));
    }

    // Projects I was added to + every project of companies I own/administer
    r.get('/', async (req, res) => {
        const [mine, cms] = await Promise.all([repo.projectMembers.forUser(req.user.id), repo.companyMembers.forUser(req.user.id)]);
        const adminCompanyIds = cms.filter(m => m.role === 'owner' || m.role === 'admin').map(m => m.companyId);
        const [direct, viaCompany] = await Promise.all([
            repo.projects.byIds(mine.map(m => m.projectId)),
            repo.projects.forCompanies(adminCompanyIds)
        ]);
        // Company names for every listed project, including companies I'm not in
        const companies = await repo.companies.byIds([...new Set([...direct, ...viaCompany].map(p => p.companyId).filter(Boolean))]);
        const byId = new Map();
        direct.forEach(p => byId.set(p.id, summary(p, mine.find(m => m.projectId === p.id).role, companies)));
        viaCompany.forEach(p => {
            const s = byId.get(p.id);
            if (!s) byId.set(p.id, summary(p, 'manager', companies));
            else if (PROJECT_ROLES.indexOf(s.role) < PROJECT_ROLES.indexOf('manager')) s.role = 'manager';
        });
        res.json({ projects: [...byId.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')) });
    });

    r.post('/', async (req, res) => {
        const { doc } = req.body;
        checkDoc(doc);
        const companyId = req.body.companyId || null;
        if (companyId) await requireCompany(repo, req.user, companyId);
        // Keep the browser's id when it's free, so links and exports stay the same
        let id = typeof doc.id === 'string' && ID.test(doc.id) ? doc.id : newId('p');
        if (await repo.projects.exists(id)) throw new HttpError(409, 'id_taken', 'A project with this id already exists.');
        doc.id = id;
        delete doc.companyId;
        const t = now();
        await repo.projects.create({ id, companyId, ownerId: req.user.id, name: doc.name.trim(), doc, version: 1, createdAt: t, updatedAt: t, updatedBy: req.user.id, deletedAt: null });
        // Link the creator to their team-member entry when the email matches
        const me = (doc.members || []).find(m => (m.email || '').toLowerCase() === req.user.email);
        await repo.projectMembers.add({ id: newId('pm'), projectId: id, userId: req.user.id, email: req.user.email, role: 'owner', memberId: me?.id || null, status: 'active', addedBy: req.user.id, createdAt: t });
        await repo.audit.add(req.user.id, 'project.create', id, { companyId });
        res.status(201).json({ id, version: 1, role: 'owner', updatedAt: t });
    });

    r.get('/:id', async (req, res) => {
        const { project, role } = await requireProject(repo, req.user, req.params.id, 'read');
        const company = project.companyId ? await repo.companies.byId(project.companyId) : null;
        res.json({ doc: { ...project.doc, updatedAt: project.updatedAt }, version: project.version, role, companyId: project.companyId || null, companyName: company?.name || null });
    });

    // Cheap check used by open pages to notice other people's saves
    r.get('/:id/version', async (req, res) => {
        const { project } = await requireProject(repo, req.user, req.params.id, 'read');
        const by = project.updatedBy && project.updatedBy !== req.user.id ? await repo.users.byId(project.updatedBy) : null;
        res.json({ version: project.version, updatedAt: project.updatedAt, updatedBy: by ? by.name : null });
    });

    r.put('/:id', async (req, res) => {
        await requireProject(repo, req.user, req.params.id, 'edit');
        const { doc, version } = req.body;
        checkDoc(doc);
        if (!Number.isInteger(version)) throw bad('Missing version.');
        doc.id = req.params.id;
        delete doc.updatedAt;
        const saved = await repo.projects.saveDoc(req.params.id, { doc, name: doc.name.trim(), expectedVersion: version, userId: req.user.id });
        const current = await repo.projects.byId(req.params.id);
        if (!saved) {
            const by = current?.updatedBy ? await repo.users.byId(current.updatedBy) : null;
            const who = !by ? 'Someone' : by.id === req.user.id ? 'You (in another tab or device)' : by.name;
            return res.status(409).json({ error: 'conflict', message: `${who} changed this project after you opened it. Reload to get the latest version.`, version: current?.version });
        }
        res.json({ version: current.version, updatedAt: current.updatedAt });
    });

    r.delete('/:id', async (req, res) => {
        await requireProject(repo, req.user, req.params.id, 'delete');
        await repo.projects.softDelete(req.params.id, req.user.id);
        await repo.audit.add(req.user.id, 'project.delete', req.params.id);
        res.json({ ok: true });
    });

    // ─── Who has access ───
    r.get('/:id/access', async (req, res) => {
        const access = await requireProject(repo, req.user, req.params.id, 'read');
        res.json({ role: access.role, people: await accessList(req.params.id, req.user.id) });
    });

    // Add by email: active now (and notified) if they have a confirmed account, otherwise invited by email
    r.post('/:id/access', inviteLimit, async (req, res) => {
        const access = await requireProject(repo, req.user, req.params.id, 'manageAccess');
        const email = cleanEmail(req.body.email);
        const role = req.body.role || 'member';
        if (!EMAIL.test(email)) throw bad('Enter a valid email address.');
        if (!canGrant(access, role)) throw bad(`You can't give the ${role} role.`);
        if (await repo.projectMembers.byEmail(req.params.id, email)) throw new HttpError(409, 'exists', 'This person already has access.');
        const user = await repo.users.byEmail(email);
        const active = accountReady(user);
        const memberId = typeof req.body.memberId === 'string' ? req.body.memberId.slice(0, 64) : null;
        await repo.projectMembers.add({ id: newId('pm'), projectId: req.params.id, userId: active ? user.id : null, email, role, memberId, status: active ? 'active' : 'pending', addedBy: req.user.id, createdAt: now() });
        const emailed = await notifyMember(repo, mailer, { inviter: req.user, email, role, target: await target(access.project), active });
        await repo.audit.add(req.user.id, 'project.access.add', req.params.id, { email, role, emailed });
        res.status(201).json({ people: await accessList(req.params.id, req.user.id), pending: !active, emailed, name: user?.name || null });
    });

    r.post('/:id/access/:aid/resend', inviteLimit, async (req, res) => {
        const access = await requireProject(repo, req.user, req.params.id, 'manageAccess');
        const m = await repo.projectMembers.byId(req.params.aid);
        if (!m || m.projectId !== req.params.id) throw new HttpError(404, 'not_found', 'Person not found.');
        if (m.status !== 'pending') throw bad('This person already has access.');
        const emailed = await notifyMember(repo, mailer, { inviter: req.user, email: m.email, role: m.role, target: await target(access.project), active: false });
        if (!emailed) throw new HttpError(502, 'email_failed', 'The email could not be sent. Try again later.');
        res.json({ ok: true });
    });

    r.patch('/:id/access/:aid', async (req, res) => {
        const access = await requireProject(repo, req.user, req.params.id, 'manageAccess');
        const m = await repo.projectMembers.byId(req.params.aid);
        if (!m || m.projectId !== req.params.id) throw new HttpError(404, 'not_found', 'Person not found.');
        if (m.role === 'owner') throw bad('The owner\'s access can\'t be changed. Transfer ownership instead.');
        const patch = {};
        if (req.body.role !== undefined) {
            if (!canGrant(access, req.body.role)) throw bad(`You can't give the ${req.body.role} role.`);
            patch.role = req.body.role;
        }
        if (req.body.memberId !== undefined) patch.memberId = req.body.memberId ? String(req.body.memberId).slice(0, 64) : null;
        await repo.projectMembers.update(m.id, patch);
        await repo.audit.add(req.user.id, 'project.access.change', req.params.id, { email: m.email, ...patch });
        res.json({ people: await accessList(req.params.id, req.user.id) });
    });

    // Managers remove people; anyone except the owner can leave
    r.delete('/:id/access/:aid', async (req, res) => {
        const m = await repo.projectMembers.byId(req.params.aid);
        if (!m || m.projectId !== req.params.id) throw new HttpError(404, 'not_found', 'Person not found.');
        const self = m.userId === req.user.id;
        const access = await requireProject(repo, req.user, req.params.id, self ? 'read' : 'manageAccess');
        if (m.role === 'owner') throw bad('The owner can\'t be removed. Transfer ownership first.');
        if (!self && m.role === 'manager' && access.role !== 'owner') throw bad('Only the owner can remove a manager.');
        await repo.projectMembers.remove(m.id);
        await repo.audit.add(req.user.id, self ? 'project.leave' : 'project.access.remove', req.params.id, { email: m.email });
        res.json({ ok: true });
    });

    // Owner hands the project to someone with access; the old owner becomes a manager
    r.post('/:id/transfer', async (req, res) => {
        const access = await requireProject(repo, req.user, req.params.id, 'read');
        if (access.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only the owner can transfer the project.');
        const to = await repo.projectMembers.byId(req.body.accessId);
        if (!to || to.projectId !== req.params.id || to.status !== 'active') throw bad('Pick someone who has signed up and has access.');
        const mine = await repo.projectMembers.get(req.params.id, req.user.id);
        await repo.projectMembers.update(to.id, { role: 'owner' });
        await repo.projectMembers.update(mine.id, { role: 'manager' });
        await repo.projects.update(req.params.id, { ownerId: to.userId });
        await repo.audit.add(req.user.id, 'project.transfer', req.params.id, { to: to.email });
        res.json({ people: await accessList(req.params.id, req.user.id) });
    });

    return r;
}
