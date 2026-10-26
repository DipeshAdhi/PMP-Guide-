/* Sign in with Google (OAuth 2.0 authorization code flow with PKCE).
   1. /api/auth/google/start     → sends the browser to Google's account chooser
   2. /api/auth/google/callback  → Google sends it back with a code; we exchange it for the
      person's Google profile, then sign them in (creating the account the first time).
   Google confirms the email address, so invitations waiting for it open straight away. */
import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';
import { startSession, readCookie } from '../auth.js';
import { sha256, makeToken, confirmEmail } from '../invites.js';
import { newId } from '../db/repo.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const COOKIE = 'pmr_oauth';
const b64url = buf => buf.toString('base64url');

export const googleEnabled = () => !!(config.google.clientId && config.google.clientSecret);
const redirectUri = () => `${config.appUrl}/api/auth/google/callback`;
// Only paths on this site are allowed as the place to return to
const safeNext = n => typeof n === 'string' && /^\/(?!\/)[^\s\\]*$/.test(n) ? n : '/Project_Mangment_Tool/index.html';

export function googleRoutes(repo, { fetchImpl = globalThis.fetch } = {}) {
    const r = Router();
    const fail = (res, code) => res.redirect(`/account/signin.html?error=${encodeURIComponent(code)}`);

    r.get('/start', async (req, res) => {
        if (!googleEnabled()) return fail(res, 'google_off');
        const state = b64url(randomBytes(24));
        const verifier = b64url(randomBytes(48));
        await makeToken(repo, { kind: 'oauth', email: '', meta: { verifier, next: safeNext(req.query.next) }, ttlMs: 10 * 60e3, token: state });
        // Ties the reply from Google to this browser (stops someone finishing a sign-in in your browser)
        res.cookie(COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60e3, path: '/api/auth/google' });
        const q = new URLSearchParams({
            client_id: config.google.clientId, redirect_uri: redirectUri(), response_type: 'code',
            scope: 'openid email profile', state, prompt: 'select_account',
            code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256'
        });
        res.redirect(`${AUTH_URL}?${q}`);
    });

    r.get('/callback', async (req, res) => {
        if (!googleEnabled()) return fail(res, 'google_off');
        const { code, state, error } = req.query;
        const cookieState = readCookie(req, COOKIE);
        res.clearCookie(COOKIE, { path: '/api/auth/google' });
        if (error) return fail(res, error === 'access_denied' ? 'google_cancelled' : 'google_failed');
        if (!code || !state || state !== cookieState) return fail(res, 'google_expired');
        const t = await repo.tokens.get(sha256(String(state)), 'oauth');
        if (!t) return fail(res, 'google_expired');
        await repo.tokens.use(t.id);

        // Code → tokens → profile
        let profile;
        try {
            const tokRes = await fetchImpl(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code', code_verifier: t.meta.verifier })
            });
            const tok = await tokRes.json();
            if (!tokRes.ok || !tok.access_token) throw new Error(tok.error_description || tok.error || 'no access token');
            const infoRes = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } });
            profile = await infoRes.json();
            if (!infoRes.ok || !profile.sub) throw new Error('no profile');
        } catch (e) {
            console.error('Google sign-in failed:', e.message);
            return fail(res, 'google_failed');
        }
        const email = String(profile.email || '').toLowerCase();
        if (!email || profile.email_verified !== true) return fail(res, 'google_unverified');

        // Existing account (by Google id, then by email) or a new one
        let user = await repo.users.byGoogleId(profile.sub) || await repo.users.byEmail(email);
        const now = new Date().toISOString();
        let created = false;
        if (user) {
            if (user.disabled) return fail(res, 'disabled');
            const patch = { lastLoginAt: now, lastActiveAt: now };
            if (!user.googleId) patch.googleId = profile.sub;
            await repo.users.update(user.id, patch);
            user = { ...user, ...patch };
        } else {
            user = {
                id: newId('u'), email, name: String(profile.name || email.split('@')[0]).slice(0, 80), passwordHash: null, googleId: profile.sub,
                accountType: 'personal', platformRole: 'user', disabled: false, emailVerified: false,
                createdAt: now, lastLoginAt: now, lastActiveAt: now
            };
            await repo.users.create(user);
            created = true;
            await importPicture(repo, fetchImpl, user.id, profile.picture);
        }
        // Google confirmed the address: open waiting invitations, apply admin settings
        if (!user.emailVerified || (config.adminEmails.includes(email) && user.platformRole !== 'admin')) user = await confirmEmail(repo, user);
        await repo.audit.add(user.id, created ? 'user.register' : 'user.login', user.id, { via: 'google' });
        await startSession(repo, res, user, req.headers['user-agent']);
        res.redirect(t.meta.next || '/Project_Mangment_Tool/index.html');
    });

    return r;
}

// Use the Google profile picture as the first profile picture (best effort)
async function importPicture(repo, fetchImpl, userId, url) {
    try {
        if (!url || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(url)) return;
        const res = await fetchImpl(url.replace(/=s\d+(-c)?$/, '') + '=s256-c');
        const type = (res.headers.get('content-type') || '').split(';')[0];
        if (!res.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) return;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 300 * 1024) return;
        await repo.avatars.set(userId, type, buf.toString('base64'));
    } catch (e) { /* keep initials */ }
}
