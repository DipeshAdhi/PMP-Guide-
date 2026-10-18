/* ===================================================================
   Downloads for the WBS and Milestones (PNG, PDF, CSV), and the
   milestone chart data shared with the Milestones screen.
   The Gantt chart's own drawing lives in views-gantt.js.
   =================================================================== */
(function () {
    const A = PMT.app;
    const X = PMT.exporter;
    const { toast, STATUS } = PMT.ui;
    const D = PMT.dates;
    const BAR = { backlog: '#8FA3BF', todo: '#8FA3BF', doing: '#2F6FD0', review: '#7A5CD6', done: '#36B37E' };
    const longDate = iso => D.fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
    const stamp = () => `exported ${longDate(D.todayISO())}`;

    // ════════════════ Milestones ════════════════
    // Everything the milestone chart needs, for the screen and the exports
    A.msData = () => {
        const P = A.P;
        const s = A.F.schedule ? PMT.schedule.buildSchedule(P) : null;
        const today = D.todayISO();
        const rows = P.milestones.map(m => {
            const items = m.itemIds.map(A.item).filter(Boolean);
            const done = items.filter(i => i.status === 'done').length;
            const forecast = s ? PMT.schedule.milestoneForecast(P, m, s) : null;
            const reached = items.length > 0 && done === items.length;
            const late = !reached && ((forecast && m.targetDate && forecast > m.targetDate) || (m.targetDate && m.targetDate < today));
            const state = reached ? 'Reached' : !items.length ? 'No items linked' : late ? 'Late' : 'On track';
            return { m, items, done, forecast, reached, late, state, slip: forecast && m.targetDate ? D.daysBetween(m.targetDate, forecast) : 0 };
        });
        const dates = [P.startDate, today, ...rows.flatMap(r => [r.m.targetDate, r.forecast]).filter(Boolean)].sort();
        const start = D.addDays(dates[0], -3), end = D.addDays(dates[dates.length - 1], 10);
        return { rows, start, end, total: D.daysBetween(start, end), today };
    };

    function msCanvas() {
        const P = A.P, d = A.msData();
        const LEFT = 300, RIGHT = 190, TRACK = 680, RH = 44, TOP = 72, HEAD = 34;
        const W = LEFT + TRACK + RIGHT, H = TOP + HEAD + Math.max(1, d.rows.length) * RH + 44;
        const { cv, g } = X.makeCanvas(W, H);
        const x = iso => LEFT + D.daysBetween(d.start, iso) / d.total * TRACK;
        X.titleBlock(g, X.fit(g, `${P.name} · Milestone chart`, W - 40), `${d.rows.length} milestone${d.rows.length === 1 ? '' : 's'} · ${d.rows.filter(r => r.reached).length} reached · ${d.rows.filter(r => r.late).length} late · ${stamp()}`);

        // Month ticks
        g.fillStyle = '#FAFBFC'; g.fillRect(0, TOP, W, HEAD);
        g.font = X.font(700, 11);
        for (let k = 0; k <= d.total; k++) {
            const iso = D.addDays(d.start, k);
            if (D.toDate(iso).getUTCDate() === 1 || k === 0) {
                g.fillStyle = '#1F2A37';
                g.fillText(D.toDate(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }), x(iso) + 4, TOP + 21);
                g.strokeStyle = '#E2E5E9'; g.beginPath(); g.moveTo(x(iso) + 0.5, TOP); g.lineTo(x(iso) + 0.5, H - 44); g.stroke();
            }
        }
        g.font = X.font(700, 11); g.fillStyle = '#6B7280';
        g.fillText('MILESTONE', 16, TOP + 21); g.fillText('TARGET / FORECAST', LEFT + TRACK + 12, TOP + 21);

        // Today
        if (d.today >= d.start && d.today <= d.end) { g.fillStyle = '#FF6B5B'; g.fillRect(x(d.today) - 1, TOP + HEAD, 2, H - TOP - HEAD - 44); }

        d.rows.forEach((r, n) => {
            const y = TOP + HEAD + n * RH, cy = y + RH / 2;
            if (n % 2) { g.fillStyle = '#FAFBFC'; g.fillRect(0, y, W, RH); }
            g.strokeStyle = '#EEF0F2'; g.beginPath(); g.moveTo(0, y + RH - 0.5); g.lineTo(W, y + RH - 0.5); g.stroke();
            g.fillStyle = '#1F2A37'; g.font = X.font(700, 13); g.fillText(X.fit(g, `◆ ${r.m.name}`, LEFT - 30), 16, cy - 3);
            g.font = X.font(400, 11); g.fillStyle = r.reached ? '#1F9D6B' : r.late ? '#D64545' : '#6B7280';
            g.fillText(`${r.done}/${r.items.length} items done · ${r.state}`, 16, cy + 13);
            // Progress bar under the name
            g.fillStyle = '#EEF0F2'; X.rrect(g, LEFT - 110, cy - 3, 90, 6, 3); g.fill();
            g.fillStyle = r.reached ? '#36B37E' : '#20B2AA'; X.rrect(g, LEFT - 110, cy - 3, 90 * (r.items.length ? r.done / r.items.length : 0), 6, 3); g.fill();
            // Slip line, target (hollow), forecast (filled)
            if (r.m.targetDate && r.forecast && r.forecast !== r.m.targetDate) {
                g.strokeStyle = r.slip > 0 ? '#E5484D' : '#36B37E'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(x(r.m.targetDate), cy); g.lineTo(x(r.forecast), cy); g.stroke(); g.lineWidth = 1;
            }
            if (r.m.targetDate) { X.diamond(g, x(r.m.targetDate), cy, 8); g.fillStyle = '#FFFFFF'; g.fill(); g.strokeStyle = '#1F2A37'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
            if (r.forecast) { X.diamond(g, x(r.forecast), cy, 8); g.fillStyle = r.reached ? '#1F9D6B' : r.late ? '#E5484D' : '#20B2AA'; g.fill(); }
            g.font = X.font(400, 11); g.fillStyle = '#2D3748';
            g.fillText(`Target  ${r.m.targetDate ? longDate(r.m.targetDate) : '—'}`, LEFT + TRACK + 12, cy - 3);
            g.fillStyle = r.slip > 0 ? '#D64545' : '#2D3748';
            g.fillText(`Forecast ${r.forecast ? longDate(r.forecast) : '—'}${r.slip > 0 ? ` (+${r.slip}d)` : ''}`, LEFT + TRACK + 12, cy + 13);
        });
        if (!d.rows.length) { g.fillStyle = '#6B7280'; g.font = X.font(400, 13); g.fillText('No milestones yet.', 16, TOP + HEAD + 26); }

        // Legend
        const ly = H - 16; let lx = 16; g.font = X.font(400, 11);
        const item = (draw, label) => { draw(lx + 7, ly - 4); g.fillStyle = '#2D3748'; g.fillText(label, lx + 18, ly); lx += g.measureText(label).width + 44; };
        item((a, b) => { X.diamond(g, a, b, 6); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#1F2A37'; g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }, 'Target');
        item((a, b) => { X.diamond(g, a, b, 6); g.fillStyle = '#20B2AA'; g.fill(); }, 'Forecast');
        item((a, b) => { X.diamond(g, a, b, 6); g.fillStyle = '#E5484D'; g.fill(); }, 'Late');
        item((a, b) => { X.diamond(g, a, b, 6); g.fillStyle = '#1F9D6B'; g.fill(); }, 'Reached');
        item((a, b) => { g.fillStyle = '#FF6B5B'; g.fillRect(a - 1, b - 7, 2, 14); }, 'Today');
        g.fillStyle = '#9AA0A6'; g.fillText('Made with PM Ready', W - 124, ly);
        return cv;
    }

    A.action('msPng', async () => { X.closeMenus(); if (await X.png(msCanvas(), `${X.safeName(A.P.name)}-milestones.png`)) toast('Milestone chart downloaded as an image', 'good'); });
    A.action('msPdf', async () => { X.closeMenus(); if (await X.pdf(msCanvas(), `${X.safeName(A.P.name)}-milestones.pdf`, `${A.P.name} - Milestone chart`)) toast('Milestone chart downloaded as a PDF', 'good'); });
    A.action('msCsv', () => {
        X.closeMenus();
        const d = A.msData();
        X.csv(`${X.safeName(A.P.name)}-milestones.csv`, [['Milestone', 'Target', 'Forecast', 'Days late', 'Status', 'Items done', 'Items total', 'Linked items'],
            ...d.rows.map(r => [r.m.name, r.m.targetDate || '', r.forecast || '', r.slip > 0 ? r.slip : 0, r.state, r.done, r.items.length, r.items.map(i => `${A.keyOf(i)} ${i.title}`).join('; ')])]);
        toast('Milestones exported as a spreadsheet', 'good');
    });

    // ════════════════ WBS ════════════════
    function wbsColumns() {
        const cols = A.groups().map(g => ({ g, title: g.title, code: A.code(g), kids: A.childrenOf(g.id) }));
        const loose = A.ranked().filter(i => !i.parentId || !A.item(i.parentId));
        if (loose.length) cols.push({ g: null, title: `Not in a ${A.groupWord().toLowerCase()}`, code: '–', kids: loose });
        return cols;
    }
    const under = id => { const out = []; const walk = pid => A.work().filter(i => i.parentId === pid).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; };

    function wbsCanvas() {
        const P = A.P, cols = wbsColumns(), work = A.work();
        const COLW = 236, GAP = 22, ROOT_Y = 76, ROOT_H = 58, BAR_Y = ROOT_Y + ROOT_H + 22, COL_Y = BAR_Y + 22;
        const GH = 58, IH = 52, VG = 8, IND = 16;
        // Lay out every node first so the canvas height is known
        const layout = cols.map((c, n) => {
            const x = GAP + n * (COLW + GAP);
            const nodes = [];
            let y = COL_Y + GH + 14;
            const walk = (i, depth) => { nodes.push({ i, depth, x: x + 22 + (depth - 1) * IND, y, w: COLW - 22 - (depth - 1) * IND }); y += IH + VG; A.subtasksOf(i.id).forEach(st => walk(st, depth + 1)); };
            c.kids.forEach(i => walk(i, 1));
            return { ...c, x, nodes, bottom: y };
        });
        const W = Math.max(640, GAP + cols.length * (COLW + GAP)), H = Math.max(...layout.map(c => c.bottom), COL_Y + GH + 40) + 44;
        const { cv, g } = X.makeCanvas(W, H);
        const done = work.filter(i => i.status === 'done').length;
        X.titleBlock(g, X.fit(g, `${P.name} · Work breakdown structure`, W - 40), `${work.length} work packages · ${work.length ? Math.round(done / work.length * 100) : 0}% done · ${PMT.methodName(P.method)} · ${stamp()}`);

        // Root
        const rootW = Math.min(360, W - 40), rx = (W - rootW) / 2;
        g.fillStyle = '#1E2A38'; X.rrect(g, rx, ROOT_Y, rootW, ROOT_H, 10); g.fill();
        g.textAlign = 'center';
        g.fillStyle = '#FFB700'; g.font = X.font(600, 11); g.fillText('0', W / 2, ROOT_Y + 17);
        g.fillStyle = '#FFFFFF'; g.font = X.font(700, 15); g.fillText(X.fit(g, P.name, rootW - 30), W / 2, ROOT_Y + 36);
        g.font = X.font(400, 11); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(`${work.length} work packages`, W / 2, ROOT_Y + 51);
        g.textAlign = 'left';

        // Connectors root → columns
        g.strokeStyle = '#C1C7D0'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(W / 2, ROOT_Y + ROOT_H); g.lineTo(W / 2, BAR_Y); g.stroke();
        if (layout.length) {
            const c0 = layout[0].x + COLW / 2, c1 = layout[layout.length - 1].x + COLW / 2;
            g.beginPath(); g.moveTo(Math.min(c0, W / 2), BAR_Y); g.lineTo(Math.max(c1, W / 2), BAR_Y); g.stroke();
            layout.forEach(c => { g.beginPath(); g.moveTo(c.x + COLW / 2, BAR_Y); g.lineTo(c.x + COLW / 2, COL_Y); g.stroke(); });
        }

        layout.forEach(c => {
            // Deliverable / epic box with progress
            const all = c.g ? under(c.g.id) : c.kids, dn = all.filter(i => i.status === 'done').length;
            g.fillStyle = c.g ? '#FBFAFF' : '#F7F8FA'; X.rrect(g, c.x, COL_Y, COLW, GH, 8); g.fill();
            g.strokeStyle = '#E2E5E9'; g.lineWidth = 1; g.stroke();
            g.fillStyle = c.g ? '#904EE2' : '#C1C7D0'; X.rrect(g, c.x, COL_Y, COLW, 4, 2); g.fill();
            g.fillStyle = '#6B7280'; g.font = X.font(600, 11); g.fillText(c.code, c.x + 10, COL_Y + 20);
            g.fillStyle = '#1F2A37'; g.font = X.font(700, 13); g.fillText(X.fit(g, c.title, COLW - 50), c.x + 30, COL_Y + 20);
            g.fillStyle = '#EEF0F2'; X.rrect(g, c.x + 10, COL_Y + 36, COLW - 70, 6, 3); g.fill();
            g.fillStyle = '#36B37E'; X.rrect(g, c.x + 10, COL_Y + 36, (COLW - 70) * (all.length ? dn / all.length : 0), 6, 3); g.fill();
            g.fillStyle = '#6B7280'; g.font = X.font(400, 11); g.fillText(`${dn}/${all.length}`, c.x + COLW - 50, COL_Y + 42);

            // Rail + nodes
            if (c.nodes.length) {
                g.strokeStyle = '#DFE1E6'; g.lineWidth = 2;
                const lastTop = c.nodes.filter(n => n.depth === 1).pop();
                g.beginPath(); g.moveTo(c.x + 10, COL_Y + GH); g.lineTo(c.x + 10, lastTop.y + 22); g.stroke();
            }
            c.nodes.forEach(n => {
                const i = n.i, m = A.member(i.assigneeId);
                g.strokeStyle = '#DFE1E6'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(n.x - (n.depth === 1 ? 12 : IND - 4), n.y + 22); g.lineTo(n.x, n.y + 22); g.stroke();
                if (n.depth > 1) { g.beginPath(); g.moveTo(n.x - IND + 4, n.y - VG); g.lineTo(n.x - IND + 4, n.y + 22); g.stroke(); }
                g.lineWidth = 1;
                g.fillStyle = i.status === 'done' ? '#F6FCF9' : '#FFFFFF'; X.rrect(g, n.x, n.y, n.w, IH, 7); g.fill();
                g.strokeStyle = '#E2E5E9'; g.stroke();
                g.fillStyle = BAR[i.status]; X.rrect(g, n.x, n.y, 4, IH, 2); g.fill();
                g.fillStyle = '#6B7280'; g.font = X.font(600, 10);
                g.fillText(`${A.code(i) ? A.code(i) + '  ' : ''}${A.keyOf(i)}${i.status === 'done' ? '  ✓' : ''}`, n.x + 10, n.y + 15);
                g.fillStyle = '#1F2A37'; g.font = X.font(600, 12); g.fillText(X.fit(g, i.title, n.w - 18), n.x + 10, n.y + 31);
                g.font = X.font(700, 9); g.fillStyle = BAR[i.status]; g.fillText(STATUS[i.status].toUpperCase(), n.x + 10, n.y + 45);
                g.font = X.font(400, 10); g.fillStyle = '#6B7280';
                const right = [i.dueDate ? `Due ${D.fmt(i.dueDate)}` : '', m ? m.name : ''].filter(Boolean).join(' · ');
                const rw = g.measureText(right).width;
                g.fillText(X.fit(g, right, n.w - 90), n.x + n.w - Math.min(rw, n.w - 90) - 8, n.y + 45);
            });
        });

        // Legend
        const ly = H - 16; let lx = 16; g.font = X.font(400, 11);
        [['To do', BAR.todo], ['In progress', BAR.doing], ['Review', BAR.review], ['Done', BAR.done]].forEach(([label, col]) => { g.fillStyle = col; g.fillRect(lx, ly - 9, 14, 10); g.fillStyle = '#2D3748'; g.fillText(label, lx + 19, ly); lx += g.measureText(label).width + 40; });
        g.fillStyle = '#9AA0A6'; g.fillText('Made with PM Ready', W - 124, ly);
        return cv;
    }

    A.action('wbsPng', async () => { X.closeMenus(); if (await X.png(wbsCanvas(), `${X.safeName(A.P.name)}-wbs.png`)) toast('WBS downloaded as an image', 'good'); });
    A.action('wbsPdf', async () => { X.closeMenus(); if (await X.pdf(wbsCanvas(), `${X.safeName(A.P.name)}-wbs.pdf`, `${A.P.name} - Work breakdown structure`)) toast('WBS downloaded as a PDF', 'good'); });
    A.action('wbsCsv', () => {
        X.closeMenus();
        const s = PMT.schedule.buildSchedule(A.P);
        const rows = [['WBS code', 'Level', 'Key', 'Name', 'Type', 'Status', 'Assignee', 'Start', 'Due', 'Progress']];
        const walk = (i, level) => {
            const t = s.byId[i.id], m = A.member(i.assigneeId);
            rows.push([A.code(i), level, A.keyOf(i), i.title, A.isSubtask(i) ? 'Subtask' : 'Work package', STATUS[i.status], m ? m.name : '', t ? t.startDate : '', t ? t.endDate : '', i.status === 'done' ? '100%' : '']);
            A.subtasksOf(i.id).forEach(st => walk(st, level + 1));
        };
        wbsColumns().forEach(c => {
            const all = c.g ? under(c.g.id) : c.kids, dn = all.filter(i => i.status === 'done').length;
            const sp = all.map(i => s.byId[i.id]).filter(Boolean);
            rows.push([c.code, 1, '', c.title, c.g ? A.groupWord() : 'Ungrouped', '', '', sp.length ? sp.map(t => t.startDate).sort()[0] : '', sp.length ? sp.map(t => t.endDate).sort().pop() : '', all.length ? `${Math.round(dn / all.length * 100)}%` : '']);
            c.kids.forEach(i => walk(i, 2));
        });
        X.csv(`${X.safeName(A.P.name)}-wbs.csv`, rows);
        toast('WBS exported as a spreadsheet', 'good');
    });
})();
