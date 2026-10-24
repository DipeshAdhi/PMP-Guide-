// Companies: create, staff (add by email with notification, roles, remove), company projects
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { requireCompany, COMPANY_ROLES } from '../permissions.js';
import { EMAIL, cleanEmail, cleanText, bad, HttpError, rateLimit } from '../security.js';
import { newId } from '../db/repo.js';
import { notifyMember, accountReady } from '../invites.js';

const now = () => new Date().toISOString();

export function companyRoutes(repo, mailer) {
    const r = Router();
    r.use(requireUser);
    const inviteLimit = rateLimit({ windowMs: 60 * 60e3, max: 60, key: req => `invite|${req.user.id}` });

    async function staffList(companyId, meId) {
        const [ms, projects] = await Promise.all([repo.companyMembers.forCompany(companyId), repo.projects.forCompanies([companyId])]);
        const access = await Promise.all(projects.map(p => repo.projectMembers.forProject(p.id)));
        const users = await Promise.all(ms.map(m => m.userId ? repo.users.byId(m.userId) : null));
        return ms.map((m, i) => ({
            id: m.id, email: m.email, name: users[i]?.name || '', role: m.role, status: m.status, isYou: m.userId === meId, createdAt: m.createdAt,
            lastActiveAt: users[i]?.lastActiveAt || null,
            // Company projects this person can open directly (owners/admins can open all of them anyway)
            projects: access.filter(list => list.some(a => a.status === 'active' ? a.userId && a.userId === m.userId : a.email === m.email)).length
        }));
    }

    r.get('/', async (req, res) => {
        const ms = await repo.companyMembers.forUser(req.user.id);
        const cs = await repo.companies.byIds(ms.map(m => m.companyId));
        const out = await Promise.all(ms.map(async m => ({
            id: m.companyId, name: cs.find(c => c.id === m.companyId)?.name || '', role: m.role,
            members: await repo.companyMembers.count(m.companyId), projects: await repo.projects.countForCompany(m.companyId)
        })));
        res.json({ companies: out });
    });

    r.post('/', async (req, res) => {
        const name = cleanText(req.body.name, 120);
        if (!name) throw bad('Enter the company name.');
        const company = { id: newId('c'), name, createdBy: req.user.id, createdAt: now() };
        await repo.companies.create(company);
        await repo.companyMembers.add({ id: newId('cm'), companyId: company.id, userId: req.user.id, email: req.user.email, role: 'owner', status: 'active', addedBy: req.user.id, createdAt: now() });
        await repo.audit.add(req.user.id, 'company.create', company.id, { name });
        res.status(201).json({ company: { id: company.id, name, role: 'owner' } });
    });

    r.get('/:id', async (req, res) => {
        const { company, role } = await requireCompany(repo, req.user, req.params.id);
        const admin = role === 'owner' || role === 'admin';
        // Admins see every company project; members see the ones they were added to
        let projects = await repo.projects.forCompanies([company.id]);
        if (!admin) {
            const mine = new Set((await repo.projectMembers.forUser(req.user.id)).map(m => m.projectId));
            projects = projects.filter(p => mine.has(p.id));
        }
        const owners = await Promise.all(projects.map(p => repo.users.byId(p.ownerId)));
        res.json({
            company: { id: company.id, name: company.name, createdAt: company.createdAt }, role,
            members: await staffList(company.id, req.user.id),
            projects: await Promise.all(projects.map(async (p, i) => {
                const work = (p.doc.items || []).filter(it => it.kind !== 'group');
                return { id: p.id, name: p.name, owner: owners[i]?.name || '', people: await repo.projectMembers.count(p.id), total: work.length, done: work.filter(it => it.status === 'done').length, updatedAt: p.updatedAt };
            }))
        });
    });

    r.patch('/:id', async (req, res) => {
        await requireCompany(repo, req.user, req.params.id, 'admin');
        const name = cleanText(req.body.name, 120);
        if (!name) throw bad('Enter the company name.');
        await repo.companies.update(req.params.id, { name });
        res.json({ ok: true });
    });

    // Add staff by email: active now and notified if they have a confirmed account, otherwise invited by email
    r.post('/:id/members', inviteLimit, async (req, res) => {
        const { company } = await requireCompany(repo, req.user, req.params.id, 'admin');
        const email = cleanEmail(req.body.email);
        const role = req.body.role || 'member';
        if (!EMAIL.test(email)) throw bad('Enter a valid email address.');
        if (!['member', 'admin'].includes(role)) throw bad('Role must be member or admin.');
        if (await repo.companyMembers.byEmail(company.id, email)) throw new HttpError(409, 'exists', 'This person is already on the staff list.');
        const user = await repo.users.byEmail(email);
        const active = accountReady(user);
        await repo.companyMembers.add({ id: newId('cm'), companyId: company.id, userId: active ? user.id : null, email, role, status: active ? 'active' : 'pending', addedBy: req.user.id, createdAt: now() });
        const emailed = await notifyMember(repo, mailer, { inviter: req.user, email, role, target: { type: 'company', id: company.id, name: company.name }, active });
        await repo.audit.add(req.user.id, 'company.member.add', company.id, { email, role, emailed });
        res.status(201).json({ members: await staffList(company.id, req.user.id), pending: !active, emailed });
    });

    r.post('/:id/members/:mid/resend', inviteLimit, async (req, res) => {
        const { company } = await requireCompany(repo, req.user, req.params.id, 'admin');
        const m = await repo.companyMembers.byId(req.params.mid);
        if (!m || m.companyId !== company.id) throw new HttpError(404, 'not_found', 'Person not found.');
        if (m.status !== 'pending') throw bad('This person has already joined.');
        const emailed = await notifyMember(repo, mailer, { inviter: req.user, email: m.email, role: m.role, target: { type: 'company', id: company.id, name: company.name }, active: false });
        if (!emailed) throw new HttpError(502, 'email_failed', 'The email could not be sent. Try again later.');
        res.json({ ok: true });
    });

    r.patch('/:id/members/:mid', async (req, res) => {
        const { company } = await requireCompany(repo, req.user, req.params.id, 'admin');
        const m = await repo.companyMembers.byId(req.params.mid);
        if (!m || m.companyId !== company.id) throw new HttpError(404, 'not_found', 'Member not found.');
        if (m.role === 'owner') throw bad('The owner\'s role can\'t be changed.');
        if (!['member', 'admin'].includes(req.body.role)) throw bad('Role must be member or admin.');
        await repo.companyMembers.update(m.id, { role: req.body.role });
        await repo.audit.add(req.user.id, 'company.member.role', company.id, { email: m.email, role: req.body.role });
        res.json({ members: await staffList(company.id, req.user.id) });
    });

    // Admins remove people; anyone except the owner can leave
    r.delete('/:id/members/:mid', async (req, res) => {
        const m = await repo.companyMembers.byId(req.params.mid);
        if (!m || m.companyId !== req.params.id) throw new HttpError(404, 'not_found', 'Member not found.');
        const self = m.userId === req.user.id;
        if (self) await requireCompany(repo, req.user, req.params.id);
        else await requireCompany(repo, req.user, req.params.id, 'admin');
        if (m.role === 'owner') throw bad('The owner can\'t be removed.');
        await repo.companyMembers.remove(m.id);
        await repo.audit.add(req.user.id, self ? 'company.leave' : 'company.member.remove', req.params.id, { email: m.email });
        res.json({ ok: true });
    });

    return r;
}

export { COMPANY_ROLES };
