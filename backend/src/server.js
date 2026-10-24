/* PM Ready server: the JSON API under /api plus the website itself,
   so pages and API share one origin and the sign-in cookie just works. */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { loadUser } from './auth.js';
import { sameOriginWrites, HttpError } from './security.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes } from './routes/companies.js';
import { projectRoutes } from './routes/projects.js';
import { courseRoutes } from './routes/course.js';
import { adminRoutes } from './routes/admin.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createApp(db) {
    const { repo } = db;
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 'loopback');

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
    api.use('/auth', authRoutes(repo));
    api.use('/companies', companyRoutes(repo));
    api.use('/projects', projectRoutes(repo));
    api.use('/me/course', courseRoutes(repo));
    api.use('/admin', adminRoutes(repo));
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
    app.use(express.static(SITE_ROOT, { dotfiles: 'deny', index: 'index.html' }));
    return app;
}

// Started directly (npm start), not imported by tests
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    let db;
    try {
        db = await openDatabase(config);
    } catch (err) {
        console.error(`\nCould not connect to the database (${config.dbDriver}: ${config.dbDriver === 'mongo' ? config.mongoUri : ''}).`);
        console.error(`  ${err.message}`);
        if (config.dbDriver === 'mongo') console.error('  Is MongoDB running? See backend/README.md → "Start MongoDB".\n');
        process.exit(1);
    }
    const server = createApp(db).listen(config.port, '127.0.0.1', () => {
        console.log(`PM Ready running at http://localhost:${config.port}  (database: ${config.dbDriver}${config.dbDriver === 'mongo' ? ` ${config.mongoUri}${config.dbName}` : ''})`);
        if (!config.adminEmails.length) console.log('Tip: set ADMIN_EMAILS in backend/.env (or run "npm run make-admin -- you@company.com") to open the admin dashboard.');
    });
    const stop = async () => { server.close(); await db.close(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
