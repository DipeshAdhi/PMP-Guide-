/* PM Ready server: the JSON API under /api plus the website itself,
   so pages and API share one origin and the sign-in cookie just works. */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { loadUser } from './auth.js';
import { createMailer } from './mailer.js';
import { sameOriginWrites, HttpError } from './security.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes } from './routes/companies.js';
import { projectRoutes } from './routes/projects.js';
import { courseRoutes } from './routes/course.js';
import { adminRoutes } from './routes/admin.js';
import { userRoutes } from './routes/users.js';
import { googleRoutes, googleEnabled } from './routes/google.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createApp(db, options = {}) {
    const { repo } = db;
    const mailer = db.mailer || createMailer(repo);
    const app = express();
    app.locals.mailer = mailer;
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);

    app.use((req, res, next) => {
        res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
        next();
    });

    // ─── API ───
    const api = express.Router();
    api.use(express.json({ limit: config.maxBody }));
    api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    api.use(sameOriginWrites);
    api.use(loadUser(repo));
    api.get('/health', async (req, res) => {
        await db.ping();
        res.json({ ok: true, db: config.dbDriver });
    });
    // Which sign-in buttons the pages should show
    api.get('/auth/providers', (req, res) => res.json({ password: true, google: googleEnabled() }));
    api.use('/auth/google', googleRoutes(repo, { fetchImpl: options.fetch }));
    api.use('/auth', authRoutes(repo, mailer));
    api.use('/companies', companyRoutes(repo, mailer));
    api.use('/projects', projectRoutes(repo, mailer));
    api.use('/me/course', courseRoutes(repo));
    api.use('/admin', adminRoutes(repo));
    api.use('/users', userRoutes(repo));
    api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'No such API endpoint.' }));
    api.use((err, req, res, next) => {
        if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
        if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'This project is too large to save.' });
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Invalid JSON.' });
        if (err.code === 11000) return res.status(409).json({ error: 'exists', message: 'That already exists.' });
        console.error(err);
        res.status(500).json({ error: 'server', message: 'Something went wrong on the server.' });
    });
    app.use('/api', api);

    // ─── Website (static files); never serve the backend's own folder ───
    app.use('/backend', (req, res) => res.status(404).end());
    // no-cache = browsers re-check each file, so an update shows up on the next reload
    app.use(express.static(SITE_ROOT, { dotfiles: 'deny', index: 'index.html', setHeaders: res => res.set('Cache-Control', 'no-cache') }));
    return app;
}

// Started directly (npm start), not imported by tests
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    let db;
    try {
        db = await openDatabase(config);
    } catch (err) {
        console.error(`\nCould not connect to the database (${config.dbDriver}${config.dbDriver === 'mongo' ? ': ' + config.mongoUri.replace(/\/\/[^@/]*@/, '//***@') : ''}).`);
        console.error(`  ${err.message}`);
        if (config.dbDriver === 'mongo') console.error('  Is MongoDB running? See backend/README.md → "Start MongoDB".\n');
        process.exit(1);
    }
    // Express 5 calls this with an error too (e.g. the port is taken)
    const server = createApp(db).listen(config.port, config.host, async err => {
        if (err) {
            console.error(err.code === 'EADDRINUSE'
                ? `\nPort ${config.port} is already in use: PM Ready (or another app) is already running there.\n  Open http://localhost:${config.port}, or stop the other one (Ctrl+C in its terminal), or set PORT in backend/.env.\n`
                : `\nCould not start the server: ${err.message}\n`);
            await db.close();
            process.exit(1);
        }
        // Never print database passwords (hosted MongoDB URLs contain them)
        const dbShown = config.dbDriver === 'mongo' ? ` ${config.mongoUri.replace(/\/\/[^@/]*@/, '//***@')}${config.dbName}` : '';
        console.log(`PM Ready running at ${config.appUrl}  (listening on ${config.host}:${config.port}, database: ${config.dbDriver}${dbShown})`);
        if (!config.superAdminEmail) console.log('Tip: set SUPER_ADMIN_EMAIL in backend/.env to your email to get the admin dashboard.');
        console.log(`Email: ${config.smtp.host ? `${config.smtp.host}:${config.smtp.port}` : 'printed here (no SMTP_HOST)'} · Google sign-in: ${config.google.clientId && config.google.clientSecret ? 'on' : 'off (see backend/SETUP.md)'}`);
    });
    const stop = async () => { server.close(); await db.close(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
