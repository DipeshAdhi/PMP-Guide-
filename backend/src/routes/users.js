// Profile pictures (signed-in people only)
import { Router } from 'express';
import { requireUser } from '../auth.js';

export function userRoutes(repo) {
    const r = Router();
    r.use(requireUser);
    r.get('/:id/avatar', async (req, res) => {
        const a = await repo.avatars.get(req.params.id);
        if (!a) return res.status(404).json({ error: 'not_found', message: 'No picture.' });
        // The URL changes when the picture changes (?v=…), so it can be cached
        res.set({ 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'" });
        res.send(Buffer.from(a.data, 'base64'));
    });
    return r;
}
