// Companies: create, see members, add people by email, change their company role
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { requireCompany, COMPANY_ROLES } from '../permissions.js';
import { EMAIL, cleanEmail, cleanText, bad, HttpError } from '../security.js';
import { newId } from '../db/repo.js';

const now = () => new Date().toISOString();

export function companyRoutes(repo) {
    const r = Router();
    r.use(requireUser);

    async function memberList(companyId, meId) {
        const ms = await repo.companyMembers.forCompany(companyId);
        const users = await Promise.all(ms.map(m => m.userId ? repo.users.byId(m.userId) : null));
        return ms.map((m, i) => ({ id: m.id, email: m.email, name: users[i]?.name || '', role: m.role, status: m.status, isYou: m.userId === meId, createdAt: m.createdAt }));
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
        await repo.audit.add(req.user.id, 'company.create', company.id);
        res.status(201).json({ company: { id: company.id, name, role: 'owner' } });
    });

    r.get('/:id', async (req, res) => {
        const { company, role } = await requireCompany(repo, req.user, req.params.id);
        res.json({ company: { id: company.id, name: company.name, createdAt: company.createdAt }, role, members: await memberList(company.id, req.user.id) });
    });

    r.patch('/:id', async (req, res) => {
        await requireCompany(repo, req.user, req.params.id, 'admin');
        const name = cleanText(req.body.name, 120);
        if (!name) throw bad('Enter the company name.');
        await repo.companies.update(req.params.id, { name });
        res.json({ ok: true });
    });

    // Add a person by email: active straight away if they have an account, otherwise pending until they register
    r.post('/:id/members', async (req, res) => {
        const { company } = await requireCompany(repo, req.user, req.params.id, 'admin');
        const email = cleanEmail(req.body.email);
        const role = req.body.role || 'member';
        if (!EMAIL.test(email)) throw bad('Enter a valid email address.');
        if (!['member', 'admin'].includes(role)) throw bad('Role must be member or admin.');
        if (await repo.companyMembers.byEmail(company.id, email)) throw new HttpError(409, 'exists', 'This person is already in the company.');
        const user = await repo.users.byEmail(email);
        await repo.companyMembers.add({ id: newId('cm'), companyId: company.id, userId: user?.id || null, email, role, status: user ? 'active' : 'pending', addedBy: req.user.id, createdAt: now() });
        await repo.audit.add(req.user.id, 'company.member.add', company.id, { email, role });
        res.status(201).json({ members: await memberList(company.id, req.user.id), pending: !user });
    });

    r.patch('/:id/members/:mid', async (req, res) => {
        const { company } = await requireCompany(repo, req.user, req.params.id, 'admin');
        const m = await repo.companyMembers.byId(req.params.mid);
        if (!m || m.companyId !== company.id) throw new HttpError(404, 'not_found', 'Member not found.');
        if (m.role === 'owner') throw bad('The owner\'s role can\'t be changed.');
        if (!['member', 'admin'].includes(req.body.role)) throw bad('Role must be member or admin.');
        await repo.companyMembers.update(m.id, { role: req.body.role });
        await repo.audit.add(req.user.id, 'company.member.role', company.id, { email: m.email, role: req.body.role });
        res.json({ members: await memberList(company.id, req.user.id) });
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
