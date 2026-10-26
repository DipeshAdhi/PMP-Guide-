// End-to-end API tests:  npm test  (in-memory database)
//                         npm run test:mongo  (real MongoDB, throwaway database pm_ready_test)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_DRIVER = process.env.TEST_DB_DRIVER || 'memory';
process.env.DB_NAME = 'pm_ready_test';
process.env.SUPER_ADMIN_EMAIL = 'boss@pmready.test';
process.env.ADMIN_EMAILS = '';
const { config } = await import('../src/config.js');
const { openDatabase } = await import('../src/db/index.js');
const { createApp } = await import('../src/server.js');

let server, base, db, mailer;
before(async () => {
    if (config.dbDriver === 'mongo') await dropTestDb();
    db = await openDatabase(config);
    const app = createApp(db);
    mailer = app.locals.mailer;
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    server.close();
    await db.close();
    if (config.dbDriver === 'mongo') await dropTestDb();
});
async function dropTestDb() {
    const { MongoClient } = await import('mongodb');
    const c = await MongoClient.connect(config.mongoUri);
    await c.db('pm_ready_test').dropDatabase();
    await c.close();
}

// A tiny client that keeps its own cookie, like one browser
function client() {
    let cookie = '';
    return async (method, path, body, headers = {}) => {
        const res = await fetch(base + path, {
            method,
            headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: base, ...headers },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    };
}

// The token in the newest email of a kind sent to someone
function mailTo(to, kind) {
    const m = [...mailer.outbox].reverse().find(x => x.to === to && (!kind || x.kind === kind));
    assert.ok(m, `no ${kind || ''} email to ${to}`);
    return { ...m, token: new URL(m.link).searchParams.get(kind?.startsWith('invite') ? 'invite' : 'token') };
}
const confirm = (c, email) => c('POST', '/api/auth/verify', { token: mailTo(email, 'verify').token });

const doc = (name, id) => ({ id, name, description: 'Test', method: { mode: 'single', key: 'scrum' }, template: 'blank', items: [{ id: 'i1', kind: 'item', status: 'done' }, { id: 'i2', kind: 'item', status: 'todo' }], members: [{ id: 'm1', name: 'Ana', email: 'ana@test.dev' }], settings: {} });

const ana = client(), ben = client(), cara = client(), boss = client(), anon = client();
let projectId, companyId;

test('health and signed-out state', async () => {
    assert.equal((await anon('GET', '/api/health')).body.ok, true);
    assert.equal((await anon('GET', '/api/auth/me')).body.user, null);
    assert.equal((await anon('GET', '/api/projects')).status, 401);
});

test('register: personal and company accounts', async () => {
    const a = await ana('POST', '/api/auth/register', { name: 'Ana', email: 'Ana@Test.dev', password: 'password-1', accountType: 'personal' });
    assert.equal(a.status, 201);
    assert.equal(a.body.user.email, 'ana@test.dev');
    assert.equal(a.body.user.platformRole, 'user');
    const b = await ben('POST', '/api/auth/register', { name: 'Ben', email: 'ben@acme.dev', password: 'password-2', accountType: 'company', companyName: 'Acme Ltd' });
    assert.equal(b.status, 201);
    assert.equal(b.body.companies[0].role, 'owner');
    companyId = b.body.companies[0].id;
    assert.equal((await anon('POST', '/api/auth/register', { name: 'X', email: 'ana@test.dev', password: 'password-1' })).status, 409);
    assert.equal((await anon('POST', '/api/auth/register', { name: 'X', email: 'x@test.dev', password: 'short' })).body.error, 'weak_password');
    assert.equal(a.body.user.passwordHash, undefined);
    assert.equal(a.body.user.emailVerified, false);
    // Confirmation emails went out; the links confirm the addresses
    assert.equal((await confirm(anon, 'ana@test.dev')).status, 200);
    assert.equal((await confirm(anon, 'ben@acme.dev')).status, 200);
    assert.equal((await ana('GET', '/api/auth/me')).body.user.emailVerified, true);
    assert.equal((await confirm(anon, 'ana@test.dev')).status, 400); // used once only
});

test('sign in, wrong password, sign out', async () => {
    const c = client();
    assert.equal((await c('POST', '/api/auth/login', { email: 'ana@test.dev', password: 'wrong-pass' })).status, 401);
    assert.equal((await c('POST', '/api/auth/login', { email: 'ana@test.dev', password: 'password-1' })).status, 200);
    assert.equal((await c('GET', '/api/auth/me')).body.user.name, 'Ana');
    await c('POST', '/api/auth/logout', {});
    assert.equal((await c('GET', '/api/auth/me')).body.user, null);
});

test('blocks cross-site and non-JSON writes', async () => {
    assert.equal((await ana('POST', '/api/projects', { doc: doc('X') }, { Origin: 'https://evil.example' })).status, 403);
    const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    assert.equal(res.status, 415);
});

test('create, list, open, save with version check', async () => {
    const c = await ana('POST', '/api/projects', { doc: doc('Ana project', 'p_local123') });
    assert.equal(c.status, 201);
    projectId = c.body.id;
    assert.equal(projectId, 'p_local123');
    const list = await ana('GET', '/api/projects');
    assert.equal(list.body.projects.length, 1);
    assert.deepEqual([list.body.projects[0].total, list.body.projects[0].done, list.body.projects[0].role], [2, 1, 'owner']);
    const g = await ana('GET', `/api/projects/${projectId}`);
    assert.equal(g.body.version, 1);
    const d = g.body.doc;
    d.name = 'Renamed';
    const s = await ana('PUT', `/api/projects/${projectId}`, { doc: d, version: 1 });
    assert.equal(s.body.version, 2);
    const stale = await ana('PUT', `/api/projects/${projectId}`, { doc: d, version: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'conflict');
    assert.equal((await ana('POST', '/api/projects', { doc: doc('Dup', 'p_local123') })).status, 409);
    assert.equal((await ana('POST', '/api/projects', { doc: { name: 'bad' } })).status, 400);
});

test('others cannot see a project until added', async () => {
    assert.equal((await ben('GET', `/api/projects/${projectId}`)).status, 404);
    assert.equal((await ben('GET', '/api/projects')).body.projects.length, 0);
});

test('viewer can read but not edit', async () => {
    const add = await ana('POST', `/api/projects/${projectId}/access`, { email: 'ben@acme.dev', role: 'viewer' });
    assert.equal(add.status, 201);
    assert.equal(add.body.pending, false);
    // Existing account: a "you were added" email with a link to the project
    const m = mailTo('ben@acme.dev', 'addedProject');
    assert.match(m.subject, /Renamed/);
    assert.match(m.link, new RegExp(`project.html\\?id=${projectId}`));
    const g = await ben('GET', `/api/projects/${projectId}`);
    assert.equal(g.body.role, 'viewer');
    assert.equal((await ben('PUT', `/api/projects/${projectId}`, { doc: g.body.doc, version: g.body.version })).status, 403);
    assert.equal((await ben('POST', `/api/projects/${projectId}/access`, { email: 'z@z.dev', role: 'member' })).status, 403);
    assert.equal((await ben('DELETE', `/api/projects/${projectId}`)).status, 403);
});

test('adding by email before sign-up: invitation email, access starts when they register from it', async () => {
    const add = await ana('POST', `/api/projects/${projectId}/access`, { email: 'cara@test.dev', role: 'member', memberId: 'm9' });
    assert.equal(add.body.pending, true);
    assert.equal(add.body.emailed, true);
    const invite = mailTo('cara@test.dev', 'inviteProject');
    assert.match(invite.subject, /Ana invited you/);
    // The sign-up page can show what the invitation is for
    const info = await anon('GET', `/api/auth/invite/${invite.token}`);
    assert.deepEqual([info.body.email, info.body.type, info.body.role], ['cara@test.dev', 'project', 'member']);
    assert.equal((await anon('POST', '/api/auth/register', { name: 'X', email: 'other@test.dev', password: 'password-9', invite: invite.token })).body.error, 'invite_email');
    // Resend makes a fresh link
    const pendingRow = add.body.people.find(p => p.email === 'cara@test.dev');
    assert.equal((await ana('POST', `/api/projects/${projectId}/access/${pendingRow.id}/resend`, {})).status, 200);
    const r = await cara('POST', '/api/auth/register', { name: 'Cara', email: 'cara@test.dev', password: 'password-3', invite: mailTo('cara@test.dev', 'inviteProject').token });
    assert.equal(r.body.claimed.projects, 1);
    assert.equal(r.body.user.emailVerified, true);
    const g = await cara('GET', `/api/projects/${projectId}`);
    assert.equal(g.body.role, 'member');
    assert.equal((await cara('PUT', `/api/projects/${projectId}`, { doc: g.body.doc, version: g.body.version })).status, 200);
    // A manager can't hand out "owner"
    assert.equal((await ana('POST', `/api/projects/${projectId}/access`, { email: 'q@q.dev', role: 'owner' })).status, 400);
});

test('registering someone else\'s email does not grab their invitation', async () => {
    await ana('POST', `/api/projects/${projectId}/access`, { email: 'dan@test.dev', role: 'member' });
    const squat = client();
    const r = await squat('POST', '/api/auth/register', { name: 'Not Dan', email: 'dan@test.dev', password: 'password-5' });
    assert.equal(r.body.claimed.projects, 0);
    // The account is told an invitation is waiting for the email confirmation
    assert.deepEqual((await squat('GET', '/api/auth/me')).body.waiting, { companies: 0, projects: 1 });
    assert.equal((await squat('GET', `/api/projects/${projectId}`)).status, 404);
    // Adding an unconfirmed account keeps it pending too
    const again = await ana('GET', `/api/projects/${projectId}/access`);
    assert.equal(again.body.people.find(p => p.email === 'dan@test.dev').status, 'pending');
    // Once the real owner of the address confirms it, access opens
    await confirm(anon, 'dan@test.dev');
    assert.equal((await squat('GET', `/api/projects/${projectId}`)).body.role, 'member');
});

test('forgot and reset password by email', async () => {
    assert.equal((await anon('POST', '/api/auth/forgot', { email: 'nobody@test.dev' })).status, 200);
    assert.equal((await anon('POST', '/api/auth/forgot', { email: 'ana@test.dev' })).status, 200);
    const { token } = mailTo('ana@test.dev', 'reset');
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'short' })).body.error, 'weak_password');
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'brand-new-pass' })).status, 200);
    assert.equal((await ana('GET', '/api/auth/me')).body.user, null); // signed out everywhere
    assert.equal((await ana('POST', '/api/auth/login', { email: 'ana@test.dev', password: 'brand-new-pass' })).status, 200);
    assert.equal((await anon('POST', '/api/auth/reset', { token, password: 'again-new-pass' })).status, 400);
});

test('company projects: company admins get manager access', async () => {
    const c = await ben('POST', '/api/projects', { doc: doc('Acme rollout'), companyId });
    assert.equal(c.status, 201);
    assert.equal((await ana('POST', '/api/projects', { doc: doc('Sneaky'), companyId })).status, 404);
    assert.equal((await ana('GET', `/api/projects/${c.body.id}`)).status, 404);
    // Shared with someone outside the company: they see it, with the company's name
    await ben('POST', `/api/projects/${c.body.id}/access`, { email: 'ana@test.dev', role: 'viewer' });
    const shared = (await ana('GET', '/api/projects')).body.projects.find(p => p.id === c.body.id);
    assert.deepEqual([shared.role, shared.companyName], ['viewer', 'Acme Ltd']);
    assert.equal((await ben('POST', `/api/companies/${companyId}/members`, { email: 'ana@test.dev', role: 'admin' })).status, 201);
    assert.match(mailTo('ana@test.dev', 'addedCompany').subject, /Acme Ltd/);
    // Staff without an account get an invitation email
    const inv = await ben('POST', `/api/companies/${companyId}/members`, { email: 'new.hire@acme.dev', role: 'member' });
    assert.deepEqual([inv.body.pending, inv.body.emailed], [true, true]);
    assert.match(mailTo('new.hire@acme.dev', 'inviteCompany').subject, /join Acme Ltd/);
    const g = await ana('GET', `/api/projects/${c.body.id}`);
    assert.equal(g.body.role, 'manager');
    assert.equal(g.body.companyName, 'Acme Ltd');
    const list = await ana('GET', '/api/projects');
    assert.equal(list.body.projects.length, 2);
    const comp = await ana('GET', `/api/companies/${companyId}`);
    assert.equal(comp.body.members.length, 3);
    assert.equal(comp.body.projects.length, 1);
    // One user, many companies; one project, many people
    assert.equal((await ana('POST', '/api/companies', { name: 'Ana Studio' })).status, 201);
    assert.equal((await ana('GET', '/api/companies')).body.companies.length, 2);
});

test('course progress syncs and counts finished modules', async () => {
    const data = { read: { 1: true, 2: true }, tried: { 1: true, 2: true }, check: { 1: 2, 2: 1 }, junk: 'x' };
    const p = await cara('PUT', '/api/me/course', { data });
    assert.equal(p.body.modulesDone, 1);
    assert.equal(p.body.data.junk, undefined);
    assert.equal((await cara('GET', '/api/me/course')).body.data.read[2], true);
});

test('admin dashboard numbers', async () => {
    assert.equal((await ana('GET', '/api/admin/stats')).status, 403);
    const r = await boss('POST', '/api/auth/register', { name: 'Boss', email: 'boss@pmready.test', password: 'password-4' });
    // Admin only after the address is confirmed
    assert.equal(r.body.user.platformRole, 'user');
    await confirm(anon, 'boss@pmready.test');
    const s = (await boss('GET', '/api/admin/stats')).body;
    assert.equal(s.users, 5);
    assert.equal(s.unverified, 0);
    assert.ok(s.emailsLast30Days >= 10);
    assert.equal(s.companies, 2);
    assert.equal(s.projects, 2);
    assert.equal(s.courseLearners, 1);
    assert.equal(s.projectUsers, 4);
    assert.equal(s.both, 1);
    assert.equal(s.signupsLast30Days.at(-1).count, 5);
    const u = (await boss('GET', '/api/admin/users?q=cara')).body;
    assert.equal(u.total, 1);
    assert.equal(u.users[0].courseModulesDone, 1);
    assert.equal((await boss('GET', '/api/admin/projects')).body.total, 2);
    assert.equal((await boss('GET', '/api/admin/companies')).body.total, 2);
    assert.ok((await boss('GET', '/api/admin/audit')).body.events.length > 5);
    // Everything about one user
    const detail = (await boss('GET', `/api/admin/users/${u.users[0].id}`)).body;
    assert.equal(detail.user.email, 'cara@test.dev');
    assert.equal(detail.projects[0].role, 'member');
    assert.equal(detail.course.modulesDone, 1);
    assert.equal(detail.sessions.length, 1);
    assert.ok(detail.emails.some(e => e.kind === 'inviteProject'));
    const log = (await boss('GET', '/api/admin/emails')).body;
    assert.ok(log.total >= 10);
    assert.equal(JSON.stringify(log).includes('token'), false); // no links stored
    // Disabling an account signs it out
    const cid = u.users[0].id;
    await boss('PATCH', `/api/admin/users/${cid}`, { disabled: true });
    assert.equal((await cara('GET', '/api/auth/me')).body.user, null);
});

test('main admin: the only one who adds or removes admins', async () => {
    const me = (await boss('GET', '/api/auth/me')).body.user;
    assert.equal(me.superAdmin, true);
    const anaId = (await boss('GET', '/api/admin/users?q=ana')).body.users[0].id;
    const benId = (await boss('GET', '/api/admin/users?q=ben')).body.users[0].id;
    assert.equal((await boss('PATCH', `/api/admin/users/${anaId}`, { platformRole: 'admin' })).status, 200);
    // Ana is an admin now, but can't make admins, change the main admin, or touch another admin
    assert.equal((await ana('GET', '/api/admin/stats')).status, 200);
    assert.equal((await ana('PATCH', `/api/admin/users/${benId}`, { platformRole: 'admin' })).status, 403);
    assert.equal((await ana('PATCH', `/api/admin/users/${me.id}`, { disabled: true })).status, 403);
    assert.equal((await boss('PATCH', `/api/admin/users/${anaId}`, { platformRole: 'user' })).status, 200);
    assert.equal((await ana('GET', '/api/admin/stats')).status, 403);
});

test('profile picture: upload, show to signed-in people, remove', async () => {
    // A 1×1 PNG
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    assert.equal((await ana('PUT', '/api/auth/me/avatar', { image: 'data:image/png;base64,' + Buffer.from('<svg/>').toString('base64') })).status, 400);
    const up = await ana('PUT', '/api/auth/me/avatar', { image: png });
    assert.match(up.body.user.avatarUrl, /^\/api\/users\/u_\w+\/avatar\?v=\d+$/);
    const res = await fetch(base + up.body.user.avatarUrl, { headers: { Cookie: (await ben('GET', '/api/auth/me')) && '' } });
    assert.equal(res.status, 401); // not for signed-out visitors
    const access = await ben('GET', `/api/companies/${companyId}`);
    assert.ok(access.body.members.find(m => m.email === 'ana@test.dev').avatarUrl);
    assert.equal((await ana('DELETE', '/api/auth/me/avatar')).body.user.avatarUrl, null);
});

test('owner deletes; project disappears for everyone', async () => {
    assert.equal((await ana('DELETE', `/api/projects/${projectId}`)).status, 200);
    assert.equal((await ana('GET', `/api/projects/${projectId}`)).status, 404);
    assert.equal((await ben('GET', `/api/projects/${projectId}`)).status, 404);
});

test('backend source is not served as a web page', async () => {
    assert.equal((await fetch(base + '/backend/src/config.js')).status, 404);
    assert.equal((await fetch(base + '/backend/.env.example')).status, 404);
});
