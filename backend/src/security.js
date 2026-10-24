// Request-level protections: same-origin check for changes, rate limits, input checks.

// Cookies are SameSite=Lax; in addition, any request that changes data must come
// from our own pages (Origin header) and send JSON, which blocks cross-site form posts.
export function sameOriginWrites(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && new URL(origin).host !== host) return res.status(403).json({ error: 'bad_origin', message: 'Request blocked: wrong origin.' });
    if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'json_only', message: 'Send JSON.' });
    next();
}

// Small fixed-window limiter kept in memory (fine for one server process)
export function rateLimit({ windowMs, max, key = req => req.ip }) {
    const hits = new Map();
    setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
    return (req, res, next) => {
        const k = key(req), t = Date.now();
        let h = hits.get(k);
        if (!h || h.reset < t) { h = { n: 0, reset: t + windowMs }; hits.set(k, h); }
        if (++h.n > max) {
            res.set('Retry-After', String(Math.ceil((h.reset - t) / 1000)));
            return res.status(429).json({ error: 'too_many', message: 'Too many attempts. Wait a few minutes and try again.' });
        }
        next();
    };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const cleanEmail = v => String(v || '').trim().toLowerCase();
export const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);

export class HttpError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const bad = (message, code = 'invalid') => new HttpError(400, code, message);
