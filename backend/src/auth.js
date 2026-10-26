/* Passwords, sign-in sessions, and the middleware that loads the current user.
   - Passwords: scrypt (built into Node) with a random salt per user.
   - Sessions: a random token in an httpOnly cookie; only its SHA-256 is stored,
     so a leaked database can't be used to sign in. */
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

export const isSuperAdmin = u => !!(u && config.superAdminEmail && u.email === config.superAdminEmail && u.emailVerified);

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const COOKIE = 'pmr_session';

export async function hashPassword(password) {
    const salt = randomBytes(16);
    const hash = await scryptAsync(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 });
    return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
    const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return timingSafeEqual(expected, actual);
}
// Same work as a real check, so "no such email" and "wrong password" take equal time
let dummyHash;
export async function burnPasswordCheck(password) {
    dummyHash = dummyHash || await hashPassword('not-a-real-password');
    await verifyPassword(password, dummyHash);
}

const sha256 = s => createHash('sha256').update(s).digest('hex');

export async function startSession(repo, res, user, userAgent = '') {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + config.sessionDays * 864e5);
    await repo.sessions.create({ id: sha256(token), userId: user.id, createdAt: new Date().toISOString(), expiresAt: expires.toISOString(), userAgent: String(userAgent).slice(0, 200) });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires, path: '/' });
}

export async function endSession(repo, req, res) {
    const token = readCookie(req, COOKIE);
    if (token) await repo.sessions.remove(sha256(token));
    res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
}

// Loads req.user (or null) on every API request
export function loadUser(repo) {
    return async (req, res, next) => {
        req.user = null;
        const token = readCookie(req, COOKIE);
        if (!token) return next();
        const session = await repo.sessions.get(sha256(token));
        if (!session) return next();
        const user = await repo.users.byId(session.userId);
        if (!user || user.disabled) return next();
        req.user = user;
        req.sessionId = session.id;
        // Record activity at most once an hour (used for "active users" numbers)
        if (!user.lastActiveAt || Date.now() - Date.parse(user.lastActiveAt) > 36e5) {
            repo.users.update(user.id, { lastActiveAt: new Date().toISOString() }).catch(() => {});
        }
        next();
    };
}

export const requireUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'signed_out', message: 'Please sign in.' });
export const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'signed_out', message: 'Please sign in.' });
    if (req.user.platformRole !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Admins only.' });
    next();
};

// What the browser is allowed to see about a user
export const avatarUrl = u => u && u.avatarAt ? `/api/users/${u.id}/avatar?v=${Date.parse(u.avatarAt)}` : null;
export const publicUser = u => u && ({
    id: u.id, email: u.email, name: u.name, accountType: u.accountType, platformRole: u.platformRole,
    superAdmin: isSuperAdmin(u), emailVerified: !!u.emailVerified, avatarUrl: avatarUrl(u), createdAt: u.createdAt
});
