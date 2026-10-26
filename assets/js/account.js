/* ===================================================================
   Accounts in the browser: talks to the PM Ready server (backend/).

   When the site is opened through the server (http://localhost:4000),
   /api exists and people can sign in. On a plain static host (GitHub
   Pages, a file:// page) there is no API: everything keeps working in
   "this browser only" mode, exactly as before.

   window.PMAccount
     available()        → Promise<boolean>  is there a server?
     me()               → Promise<{ user, companies } | null>
     api(method, path, body) → JSON (throws Error with .status, .code, .userMessage)
     signInUrl(next)    → link to the sign-in page that comes back to `next`
     signOut()          → signs out and goes to the sign-in page
     syncCourse()       → merge course progress between this browser and the account
   =================================================================== */
(function () {
    if (window.PMAccount) return;
    const script = document.currentScript;
    const ROOT = new URL('../../', script ? script.src : location.href).href;

    async function api(method, path, body) {
        const res = await fetch(new URL('api' + path, ROOT), {
            method,
            credentials: 'same-origin',
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* empty or not JSON */ }
        if (!res.ok) {
            const err = new Error((data && data.message) || `Request failed (${res.status})`);
            err.status = res.status;
            err.code = data && data.error;
            err.userMessage = data && data.message;
            err.data = data;
            throw err;
        }
        return data;
    }

    let availableP = null;
    function available() {
        if (!availableP) {
            availableP = (async () => {
                // Static hosts never have the API (GitHub Pages, opened from disk)
                if (location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)) return false;
                try {
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 4000);
                    const res = await fetch(new URL('api/health', ROOT), { signal: ctrl.signal, credentials: 'same-origin' });
                    clearTimeout(t);
                    if (!res.ok) return false;
                    const j = await res.json();
                    return !!(j && j.ok);
                } catch (e) { return false; }
            })();
        }
        return availableP;
    }

    let meP = null;
    function me(refresh) {
        if (!meP || refresh) {
            meP = (async () => {
                if (!await available()) return null;
                try { const r = await api('GET', '/auth/me'); return r.user ? r : null; }
                catch (e) { return null; }
            })();
        }
        return meP;
    }

    // Only same-site paths are allowed as a return address
    function safeNext(next) {
        if (!next) return null;
        try {
            const u = new URL(next || '', location.href);
            return u.origin === location.origin ? u.pathname + u.search + u.hash : null;
        } catch (e) { return null; }
    }
    const signInUrl = (next = location.href) => {
        const n = safeNext(next);
        return new URL('account/signin.html', ROOT).href + (n ? `?next=${encodeURIComponent(n)}` : '');
    };
    async function signOut() {
        try { await api('POST', '/auth/logout', {}); } catch (e) { /* signed out anyway */ }
        meP = null;
        location.href = new URL('account/signin.html', ROOT).href;
    }

    // ─── Course progress: combine this browser's progress with the account's ───
    const COURSE_KEY = 'pmpCourse_v1';
    const readLocal = () => { try { return JSON.parse(localStorage.getItem(COURSE_KEY)) || null; } catch (e) { return null; } };
    const hasProgress = p => !!p && ['read', 'tried', 'check'].some(k => p[k] && Object.keys(p[k]).length);
    function merge(a, b) {
        const out = { read: {}, tried: {}, check: {} };
        [a, b].forEach(p => {
            if (!p) return;
            ['read', 'tried'].forEach(k => Object.entries(p[k] || {}).forEach(([id, v]) => { if (v) out[k][id] = true; }));
            Object.entries(p.check || {}).forEach(([id, v]) => { out.check[id] = Math.max(out.check[id] || 0, Number(v) || 0); });
        });
        return out;
    }
    let lastPushed = null, pushTimer = null;
    async function pushCourse() {
        const local = readLocal();
        const s = JSON.stringify(local);
        if (!hasProgress(local) || s === lastPushed) return;
        try { await api('PUT', '/me/course', { data: local }); lastPushed = s; } catch (e) { /* try again next change */ }
    }
    async function syncCourse() {
        if (!await me()) return null;
        let server = null;
        try { server = (await api('GET', '/me/course')).data; } catch (e) { return null; }
        const local = merge(readLocal(), null);
        const merged = merge(server, local);
        const changedLocal = JSON.stringify(merged) !== JSON.stringify(local);
        if (hasProgress(merged)) {
            try { localStorage.setItem(COURSE_KEY, JSON.stringify(merged)); } catch (e) { /* storage blocked */ }
            if (JSON.stringify(merge(server, null)) !== JSON.stringify(merged)) await pushCourse();
            else lastPushed = JSON.stringify(merged);
        }
        // changedLocal: the account had progress this browser didn't (e.g. another device)
        return { progress: merged, changedLocal };
    }
    // Called by the course code after every change (debounced)
    function courseChanged() {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => { if (await me()) pushCourse(); }, 800);
    }

    // Round picture, or initials when there is none
    const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function avatarHtml(person, size = 28) {
        const name = person && (person.name || person.email) || '?';
        const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
        if (person && person.avatarUrl) return `<img class="avatar" src="${escHtml(new URL(person.avatarUrl.replace(/^\//, ''), ROOT).href)}" alt="" style="${style}">`;
        const ini = String(name).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
        return `<span class="avatar" aria-hidden="true" style="${style};background:#FFB700;color:#1E2A38">${escHtml(ini)}</span>`;
    }

    // "Confirm your email" notice; says how many invitations are waiting for it
    function verifyBanner(m) {
        if (!m || !m.user || m.user.emailVerified) return '';
        const w = m.waiting || { projects: 0, companies: 0 };
        const parts = [w.projects && `${w.projects} project invitation${w.projects > 1 ? 's' : ''}`, w.companies && `${w.companies} company invitation${w.companies > 1 ? 's' : ''}`].filter(Boolean);
        return `<div class="note warn upload-note" role="status" style="margin-bottom: 1rem;"><span>✉️ <strong>${parts.length ? `${parts.join(' and ')} waiting for you.` : 'Confirm your email.'}</strong>
            ${parts.length ? 'Open them by confirming your email:' : ''} we sent a link to <strong>${escHtml(m.user.email)}</strong>. Check your inbox (and spam folder).</span>
            <button class="btn btn-ghost btn-sm" type="button" data-resend-verify>Send the link again</button></div>`;
    }
    document.addEventListener('click', async e => {
        const b = e.target.closest('[data-resend-verify]');
        if (!b) return;
        b.disabled = true;
        try { await api('POST', '/auth/verify/resend', {}); b.textContent = 'Sent ✓ Check your inbox'; }
        catch (err) { b.textContent = err.userMessage || 'Could not send. Try again later.'; b.disabled = false; }
    });

    window.PMAccount = { ROOT, api, available, me, signInUrl, safeNext, signOut, syncCourse, courseChanged, avatarHtml, verifyBanner };
})();
