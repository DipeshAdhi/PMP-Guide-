// Register, sign in/out, current user, profile, password
import { Router } from 'express';
import { hashPassword, verifyPassword, burnPasswordCheck, startSession, endSession, requireUser, publicUser } from '../auth.js';
import { rateLimit, EMAIL, cleanEmail, cleanText, bad, HttpError } from '../security.js';
import { newId } from '../db/repo.js';
import { config } from '../config.js';

const now = () => new Date().toISOString();
const checkPassword = p => {
    if (typeof p !== 'string' || p.length < 8) throw bad('Use a password of at least 8 characters.', 'weak_password');
    if (p.length > 200) throw bad('That password is too long.', 'weak_password');
};

export function authRoutes(repo) {
    const r = Router();
    const strict = rateLimit({ windowMs: 15 * 60e3, max: 20, key: req => `${req.ip}|${cleanEmail(req.body?.email)}` });
    const perIp = rateLimit({ windowMs: 60 * 60e3, max: 30 });

    async function myCompanies(userId) {
        const ms = await repo.companyMembers.forUser(userId);
        const cs = await repo.companies.byIds(ms.map(m => m.companyId));
        return ms.map(m => ({ id: m.companyId, name: cs.find(c => c.id === m.companyId)?.name || '', role: m.role }));
    }

    r.post('/register', perIp, async (req, res) => {
        const name = cleanText(req.body.name, 80);
        const email = cleanEmail(req.body.email);
        const password = req.body.password;
        const accountType = req.body.accountType === 'company' ? 'company' : 'personal';
        const companyName = cleanText(req.body.companyName, 120);
        if (!name) throw bad('Enter your name.');
        if (!EMAIL.test(email) || email.length > 200) throw bad('Enter a valid email address.');
        checkPassword(password);
        if (accountType === 'company' && !companyName) throw bad('Enter your company name.');
        if (await repo.users.byEmail(email)) throw new HttpError(409, 'email_taken', 'An account with this email already exists. Sign in instead.');

        const user = {
            id: newId('u'), email, name, passwordHash: await hashPassword(password), accountType,
            platformRole: config.adminEmails.includes(email) ? 'admin' : 'user', disabled: false,
            createdAt: now(), lastLoginAt: now(), lastActiveAt: now()
        };
        await repo.users.create(user);
        let company = null;
        if (accountType === 'company') {
            company = { id: newId('c'), name: companyName, createdBy: user.id, createdAt: now() };
            await repo.companies.create(company);
            await repo.companyMembers.add({ id: newId('cm'), companyId: company.id, userId: user.id, email, role: 'owner', status: 'active', addedBy: user.id, createdAt: now() });
        }
        // Projects and companies this email was added to before registering
        const claimed = await repo.claimPending(email, user.id);
        await repo.audit.add(user.id, 'user.register', user.id, { accountType, companyId: company?.id });
        await startSession(repo, res, user, req.headers['user-agent']);
        res.status(201).json({ user: publicUser(user), companies: await myCompanies(user.id), claimed });
    });

    r.post('/login', strict, async (req, res) => {
        const email = cleanEmail(req.body.email);
        const password = String(req.body.password || '');
        const user = email && await repo.users.byEmail(email);
        const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
        if (!ok) throw new HttpError(401, 'bad_login', 'Email or password is incorrect.');
        if (user.disabled) throw new HttpError(403, 'disabled', 'This account is disabled. Contact support.');
        const patch = { lastLoginAt: now(), lastActiveAt: now() };
        if (config.adminEmails.includes(email) && user.platformRole !== 'admin') patch.platformRole = 'admin';
        await repo.users.update(user.id, patch);
        await startSession(repo, res, { ...user, ...patch }, req.headers['user-agent']);
        res.json({ user: publicUser({ ...user, ...patch }), companies: await myCompanies(user.id) });
    });

    r.post('/logout', async (req, res) => {
        await endSession(repo, req, res);
        res.json({ ok: true });
    });

    // 200 with user null when signed out, so pages can check without an error
    r.get('/me', async (req, res) => {
        if (!req.user) return res.json({ user: null });
        res.json({ user: publicUser(req.user), companies: await myCompanies(req.user.id) });
    });

    r.patch('/me', requireUser, async (req, res) => {
        const name = cleanText(req.body.name, 80);
        if (!name) throw bad('Enter your name.');
        await repo.users.update(req.user.id, { name });
        res.json({ user: publicUser({ ...req.user, name }) });
    });

    r.post('/password', requireUser, strict, async (req, res) => {
        if (!await verifyPassword(String(req.body.current || ''), req.user.passwordHash)) throw new HttpError(401, 'bad_login', 'Your current password is incorrect.');
        checkPassword(req.body.next);
        await repo.users.update(req.user.id, { passwordHash: await hashPassword(req.body.next) });
        // Sign out every other device
        await repo.sessions.removeForUser(req.user.id, req.sessionId);
        await repo.audit.add(req.user.id, 'user.password', req.user.id);
        res.json({ ok: true });
    });

    return r;
}
