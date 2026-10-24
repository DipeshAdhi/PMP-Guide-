// Register, sign in/out, current user, profile, password, confirm email, reset password, invitations
import { Router } from 'express';
import { hashPassword, verifyPassword, burnPasswordCheck, startSession, endSession, requireUser, publicUser } from '../auth.js';
import { rateLimit, EMAIL, cleanEmail, cleanText, bad, HttpError } from '../security.js';
import { newId } from '../db/repo.js';
import { sha256, sendVerify, sendReset, confirmEmail } from '../invites.js';
import { config } from '../config.js';

const now = () => new Date().toISOString();
const checkPassword = p => {
    if (typeof p !== 'string' || p.length < 8) throw bad('Use a password of at least 8 characters.', 'weak_password');
    if (p.length > 200) throw bad('That password is too long.', 'weak_password');
};

export function authRoutes(repo, mailer) {
    const r = Router();
    const strict = rateLimit({ windowMs: 15 * 60e3, max: 20, key: req => `${req.ip}|${cleanEmail(req.body?.email)}` });
    const perIp = rateLimit({ windowMs: 60 * 60e3, max: 30 });
    const mailLimit = rateLimit({ windowMs: 60 * 60e3, max: 6, key: req => `${req.ip}|mail|${cleanEmail(req.body?.email) || req.user?.id}` });

    async function myCompanies(userId) {
        const ms = await repo.companyMembers.forUser(userId);
        const cs = await repo.companies.byIds(ms.map(m => m.companyId));
        return ms.map(m => ({ id: m.companyId, name: cs.find(c => c.id === m.companyId)?.name || '', role: m.role }));
    }

    // What an invitation link is for (shown on the sign-up page); doesn't use it up
    r.get('/invite/:token', async (req, res) => {
        const t = await repo.tokens.get(sha256(req.params.token), 'invite');
        if (!t) throw new HttpError(404, 'invalid_invite', 'This invitation link has expired or was already used. Ask for a new one.');
        res.json({ email: t.email, inviter: t.meta.inviter, type: t.meta.type, name: t.meta.targetName, role: t.meta.role, hasAccount: !!(await repo.users.byEmail(t.email)) });
    });

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

        // Registering from an invitation link proves the email belongs to them
        const invite = req.body.invite ? await repo.tokens.get(sha256(String(req.body.invite)), 'invite') : null;
        if (req.body.invite && !invite) throw new HttpError(400, 'invalid_invite', 'This invitation link has expired or was already used. Ask for a new one, or register without it.');
        if (invite && invite.email !== email) throw bad(`This invitation is for ${invite.email}. Register with that address.`, 'invite_email');

        let user = {
            id: newId('u'), email, name, passwordHash: await hashPassword(password), accountType,
            platformRole: 'user', disabled: false, emailVerified: false,
            createdAt: now(), lastLoginAt: now(), lastActiveAt: now()
        };
        await repo.users.create(user);
        let company = null;
        if (accountType === 'company') {
            company = { id: newId('c'), name: companyName, createdBy: user.id, createdAt: now() };
            await repo.companies.create(company);
            await repo.companyMembers.add({ id: newId('cm'), companyId: company.id, userId: user.id, email, role: 'owner', status: 'active', addedBy: user.id, createdAt: now() });
        }
        let claimed = { companies: 0, projects: 0 };
        if (invite) {
            await repo.tokens.use(invite.id);
            user = await confirmEmail(repo, user);
            claimed = user.claimed;
        } else {
            await sendVerify(repo, mailer, user);
        }
        await repo.audit.add(user.id, 'user.register', user.id, { accountType, companyId: company?.id, viaInvite: !!invite });
        await startSession(repo, res, user, req.headers['user-agent']);
        res.status(201).json({ user: publicUser(user), companies: await myCompanies(user.id), claimed, verifyEmailSent: !invite });
    });

    r.post('/login', strict, async (req, res) => {
        const email = cleanEmail(req.body.email);
        const password = String(req.body.password || '');
        const user = email && await repo.users.byEmail(email);
        const ok = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
        if (!ok) throw new HttpError(401, 'bad_login', 'Email or password is incorrect.');
        if (user.disabled) throw new HttpError(403, 'disabled', 'This account is disabled. Contact support.');
        const patch = { lastLoginAt: now(), lastActiveAt: now() };
        await repo.users.update(user.id, patch);
        let u = { ...user, ...patch };
        // Admin emails become admins once the address is confirmed
        if (u.emailVerified && u.platformRole !== 'admin' && config.adminEmails.includes(email)) u = await confirmEmail(repo, u);
        await startSession(repo, res, u, req.headers['user-agent']);
        res.json({ user: publicUser(u), companies: await myCompanies(user.id) });
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

    // ─── Confirm email ───
    r.post('/verify', async (req, res) => {
        const t = await repo.tokens.get(sha256(String(req.body.token || '')), 'verify');
        if (!t) throw new HttpError(400, 'invalid_token', 'This link has expired or was already used. Sign in and send a new one from My account.');
        const user = await repo.users.byId(t.userId);
        if (!user || user.email !== t.email) throw new HttpError(400, 'invalid_token', 'This link is no longer valid.');
        await repo.tokens.use(t.id);
        const u = await confirmEmail(repo, user);
        await repo.audit.add(user.id, 'user.verify', user.id, u.claimed);
        res.json({ ok: true, email: user.email, claimed: u.claimed });
    });
    r.post('/verify/resend', requireUser, mailLimit, async (req, res) => {
        if (req.user.emailVerified) return res.json({ ok: true, already: true });
        const sent = await sendVerify(repo, mailer, req.user);
        if (!sent) throw new HttpError(502, 'email_failed', 'The email could not be sent. Try again later.');
        res.json({ ok: true });
    });

    // ─── Forgot / reset password ───
    // Same answer whether or not the email has an account
    r.post('/forgot', mailLimit, async (req, res) => {
        const email = cleanEmail(req.body.email);
        if (!EMAIL.test(email)) throw bad('Enter a valid email address.');
        const user = await repo.users.byEmail(email);
        if (user && !user.disabled) await sendReset(repo, mailer, user);
        res.json({ ok: true });
    });
    r.post('/reset', strict, async (req, res) => {
        const t = await repo.tokens.get(sha256(String(req.body.token || '')), 'reset');
        if (!t) throw new HttpError(400, 'invalid_token', 'This link has expired or was already used. Ask for a new one.');
        checkPassword(req.body.password);
        const user = await repo.users.byId(t.userId);
        if (!user || user.email !== t.email) throw new HttpError(400, 'invalid_token', 'This link is no longer valid.');
        await repo.tokens.use(t.id);
        await repo.users.update(user.id, { passwordHash: await hashPassword(req.body.password) });
        await repo.sessions.removeForUser(user.id);
        // The reset link proves the email is theirs
        if (!user.emailVerified) await confirmEmail(repo, user);
        await repo.audit.add(user.id, 'user.reset', user.id);
        res.json({ ok: true, email: user.email });
    });

    return r;
}
