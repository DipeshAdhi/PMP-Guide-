/* Small UI helpers shared by the start page and the project app. */
(function () {
    const PMT = window.PMT = window.PMT || {};

    const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    let toastTimer;
    function toast(msg, kind = '') {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            t.setAttribute('role', 'status');
            t.setAttribute('aria-live', 'polite');
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = `toast show ${kind}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }

    const COLORS = ['#168C86', '#E8604F', '#7A5CD6', '#C98A06', '#2F6FD0', '#1F9D6B', '#B8457A', '#4B5563'];
    function colorFor(id) {
        let h = 0;
        for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return COLORS[h % COLORS.length];
    }
    const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
    function avatar(member, size) {
        if (!member) return `<span class="avatar" style="background:#C7CCD3" title="Unassigned">–</span>`;
        return `<span class="avatar" style="background:${colorFor(member.id)}${size ? `;width:${size}px;height:${size}px` : ''}" title="${esc(member.name)} · ${esc(member.role)}">${esc(initials(member.name))}</span>`;
    }

    function download(filename, text) {
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    const STATUS = { backlog: 'Backlog', todo: 'To do', doing: 'In progress', review: 'Review', done: 'Done' };
    const MOSCOW = { M: 'Must', S: 'Should', C: 'Could', W: "Won't" };

    PMT.ui = { esc, toast, colorFor, initials, avatar, download, STATUS, MOSCOW };
})();
