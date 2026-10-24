// End-to-end API tests against the in-memory database:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_DRIVER = 'memory';
process.env.ADMIN_EMAILS = 'boss@pmready.test';
const { config } = await import('../src/config.js');
const { openDatabase } = await import('../src/db/index.js');
const { createApp } = await import('../src/server.js');

let server, base;
before(async () => {
    const db = await openDatabase(config);
    server = createApp(db).listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

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
    const g = await ben('GET', `/api/projects/${projectId}`);
    assert.equal(g.body.role, 'viewer');
    assert.equal((await ben('PUT', `/api/projects/${projectId}`, { doc: g.body.doc, version: g.body.version })).status, 403);
    assert.equal((await ben('POST', `/api/projects/${projectId}/access`, { email: 'z@z.dev', role: 'member' })).status, 403);
    assert.equal((await ben('DELETE', `/api/projects/${projectId}`)).status, 403);
});

test('adding by email before sign-up: access starts when they register', async () => {
    const add = await ana('POST', `/api/projects/${projectId}/access`, { email: 'cara@test.dev', role: 'member', memberId: 'm9' });
    assert.equal(add.body.pending, true);
    const r = await cara('POST', '/api/auth/register', { name: 'Cara', email: 'cara@test.dev', password: 'password-3' });
    assert.equal(r.body.claimed.projects, 1);
    const g = await cara('GET', `/api/projects/${projectId}`);
    assert.equal(g.body.role, 'member');
    assert.equal((await cara('PUT', `/api/projects/${projectId}`, { doc: g.body.doc, version: g.body.version })).status, 200);
    // A manager can't hand out "owner"
    assert.equal((await ana('POST', `/api/projects/${projectId}/access`, { email: 'q@q.dev', role: 'owner' })).status, 400);
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
    const g = await ana('GET', `/api/projects/${c.body.id}`);
    assert.equal(g.body.role, 'manager');
    assert.equal(g.body.companyName, 'Acme Ltd');
    const list = await ana('GET', '/api/projects');
    assert.equal(list.body.projects.length, 2);
    const comp = await ana('GET', `/api/companies/${companyId}`);
    assert.equal(comp.body.members.length, 2);
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
    assert.equal(r.body.user.platformRole, 'admin');
    const s = (await boss('GET', '/api/admin/stats')).body;
    assert.equal(s.users, 4);
    assert.equal(s.companies, 2);
    assert.equal(s.projects, 2);
    assert.equal(s.courseLearners, 1);
    assert.equal(s.projectUsers, 3);
    assert.equal(s.both, 1);
    assert.equal(s.signupsLast30Days.at(-1).count, 4);
    const u = (await boss('GET', '/api/admin/users?q=cara')).body;
    assert.equal(u.total, 1);
    assert.equal(u.users[0].courseModulesDone, 1);
    assert.equal((await boss('GET', '/api/admin/projects')).body.total, 2);
    assert.equal((await boss('GET', '/api/admin/companies')).body.total, 2);
    assert.ok((await boss('GET', '/api/admin/audit')).body.events.length > 5);
    // Disabling an account signs it out
    const cid = u.users[0].id;
    await boss('PATCH', `/api/admin/users/${cid}`, { disabled: true });
    assert.equal((await cara('GET', '/api/auth/me')).body.user, null);
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
