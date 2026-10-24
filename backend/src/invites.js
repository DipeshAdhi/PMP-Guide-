/* Adding people by email, with notifications.
   • Existing account with a confirmed email → active right away, "you were added" email.
   • No account yet (or email not confirmed) → pending, invitation email with a sign-up link.
     The pending access starts when they register through that link or confirm their email,
     so nobody can grab an invitation by registering someone else's address. */
import { randomBytes, createHash } from 'node:crypto';
import { config } from './config.js';

const DAY = 864e5;
export const sha256 = s => createHash('sha256').update(s).digest('hex');

// New one-time link token; only its hash is stored
export async function makeToken(repo, { kind, email, userId = null, meta = {}, ttlMs }) {
    const token = randomBytes(32).toString('base64url');
    const t = new Date();
    await repo.tokens.create({ id: sha256(token), kind, email, userId, meta, createdAt: t.toISOString(), expiresAt: new Date(t.getTime() + ttlMs).toISOString(), usedAt: null });
    return token;
}

export const accountReady = user => !!(user && user.emailVerified && !user.disabled);

const ROLE_WORDS = { owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member', viewer: 'Viewer' };

/* target: { type: 'project' | 'company', id, name, company? }  */
export async function notifyMember(repo, mailer, { inviter, email, role, target, active }) {
    const vars = { inviter: inviter.name, role: ROLE_WORDS[role] || role, project: target.name, company: target.type === 'company' ? target.name : target.company };
    if (active) {
        vars.link = target.type === 'project'
            ? `${config.appUrl}/Project_Mangment_Tool/project.html?id=${encodeURIComponent(target.id)}`
            : `${config.appUrl}/account/company.html?id=${encodeURIComponent(target.id)}`;
        return mailer.send(target.type === 'project' ? 'addedProject' : 'addedCompany', email, vars, inviter.id);
    }
    const token = await makeToken(repo, { kind: 'invite', email, meta: { type: target.type, targetId: target.id, targetName: target.name, inviter: inviter.name, role }, ttlMs: 14 * DAY });
    vars.link = `${config.appUrl}/account/signin.html?invite=${token}#register`;
    return mailer.send(target.type === 'project' ? 'inviteProject' : 'inviteCompany', email, vars, inviter.id);
}

export async function sendVerify(repo, mailer, user) {
    await repo.tokens.removeFor(user.email, 'verify');
    const token = await makeToken(repo, { kind: 'verify', email: user.email, userId: user.id, ttlMs: DAY });
    return mailer.send('verify', user.email, { name: user.name, link: `${config.appUrl}/account/verify.html?token=${token}` }, user.id);
}

export async function sendReset(repo, mailer, user) {
    await repo.tokens.removeFor(user.email, 'reset');
    const token = await makeToken(repo, { kind: 'reset', email: user.email, userId: user.id, ttlMs: DAY / 24 });
    return mailer.send('reset', user.email, { name: user.name, link: `${config.appUrl}/account/reset.html?token=${token}` }, user.id);
}

// Email confirmed (verify link, invitation link or password reset): open everything waiting for it
export async function confirmEmail(repo, user) {
    const patch = { emailVerified: true };
    if (config.adminEmails.includes(user.email)) patch.platformRole = 'admin';
    await repo.users.update(user.id, patch);
    const claimed = await repo.claimPending(user.email, user.id);
    return { ...user, ...patch, claimed };
}
