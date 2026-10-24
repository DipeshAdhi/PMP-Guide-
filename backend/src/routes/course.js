// Course progress for the signed-in user (the Learn side keeps working without an account)
import { Router } from 'express';
import { requireUser } from '../auth.js';
import { bad } from '../security.js';

const MODULES = [1, 2, 3, 4, 5, 6, 7, 8];

// Same shape and "done" rule as assets/js/site-nav.js: read + tried + at least 2 check answers right
function cleanProgress(data) {
    if (!data || typeof data !== 'object') throw bad('Invalid progress.');
    const out = { read: {}, tried: {}, check: {} };
    for (const id of MODULES) {
        if (data.read?.[id]) out.read[id] = true;
        if (data.tried?.[id]) out.tried[id] = true;
        const c = Number(data.check?.[id]);
        if (c > 0) out.check[id] = Math.min(10, Math.floor(c));
    }
    return out;
}
const modulesDone = p => MODULES.filter(id => p.read[id] && p.tried[id] && (p.check[id] || 0) >= 2).length;

export function courseRoutes(repo) {
    const r = Router();
    r.use(requireUser);

    r.get('/', async (req, res) => {
        const rec = await repo.course.get(req.user.id);
        res.json({ data: rec?.data || null, modulesDone: rec?.modulesDone || 0, updatedAt: rec?.updatedAt || null });
    });

    r.put('/', async (req, res) => {
        const data = cleanProgress(req.body.data);
        const done = modulesDone(data);
        await repo.course.save(req.user.id, data, done);
        res.json({ data, modulesDone: done });
    });

    return r;
}
