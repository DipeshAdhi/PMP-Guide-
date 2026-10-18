/* ===================================================================
   Export helpers shared by the Gantt chart, WBS, and Milestones:
   • canvas set-up and drawing helpers
   • PNG download
   • PDF download, written directly (one page, the chart as a JPEG),
     so no library and no print dialog are needed
   • a reusable "⬇ Download" menu
   =================================================================== */
(function () {
    const PMT = window.PMT = window.PMT || {};

    const safeName = name => String(name || 'project').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
    const font = (weight, px) => `${weight} ${px}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

    // White canvas at up to 2× resolution (kept under browser size limits)
    function makeCanvas(W, H) {
        const scale = Math.max(1, Math.min(2, 16000 / W, 16000 / H));
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(W * scale);
        cv.height = Math.ceil(H * scale);
        const g = cv.getContext('2d');
        g.scale(scale, scale);
        g.fillStyle = '#FFFFFF';
        g.fillRect(0, 0, W, H);
        g.textBaseline = 'alphabetic';
        return { cv, g };
    }
    function fit(g, text, max) {
        text = String(text ?? '');
        if (g.measureText(text).width <= max) return text;
        while (text && g.measureText(text + '…').width > max) text = text.slice(0, -1);
        return text + '…';
    }
    function rrect(g, x, y, w, h, r) {
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
    }
    function diamond(g, x, y, r) {
        g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    }
    // Title block used at the top of every export
    function titleBlock(g, title, subtitle) {
        g.fillStyle = '#1F2A37'; g.font = font(700, 20); g.fillText(title, 16, 32);
        g.fillStyle = '#6B7280'; g.font = font(400, 12); g.fillText(subtitle, 16, 52);
    }

    function png(cv, filename) {
        return new Promise(resolve => cv.toBlob(blob => {
            if (blob) PMT.ui.download(filename, blob);
            resolve(!!blob);
        }, 'image/png'));
    }

    // ─── Minimal PDF writer: one page sized to the chart, image as DCT (JPEG) ───
    const pdfText = s => String(s).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
    async function pdf(cv, filename, title) {
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
        if (!blob) return false;
        const jpg = new Uint8Array(await blob.arrayBuffer());
        // Page: 842 pt wide (A4 landscape width), height follows the chart's shape
        const pw = 842, ph = Math.max(200, Math.round(842 * cv.height / cv.width));
        const enc = new TextEncoder();
        const parts = [], offsets = [];
        let len = 0;
        const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
        const obj = (n, write) => { offsets[n] = len; add(`${n} 0 obj\n`); write(); add('\nendobj\n'); };
        const now = new Date(), p2 = v => String(v).padStart(2, '0');
        add('%PDF-1.4\n%âãÏÓ\n');
        obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`));
        obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); add(jpg); add('\nendstream'); });
        const content = `q\n${pw} 0 0 ${ph} 0 0 cm\n/Im0 Do\nQ`;
        obj(5, () => add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
        obj(6, () => add(`<< /Title (${pdfText(title)}) /Producer (PM Ready Project Tool) /CreationDate (D:${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}) >>`));
        const xref = len;
        add(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
        add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
        PMT.ui.download(filename, new Blob(parts, { type: 'application/pdf' }));
        return true;
    }

    // CSV with a BOM so Excel reads UTF-8 correctly
    function csv(filename, rows) {
        const q = v => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        PMT.ui.download(filename, '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    }

    // "⬇ Download" menu; buttons call actions named <prefix>Png / <prefix>Pdf / <prefix>Csv
    function menu(prefix, label = 'Download') {
        return `<details class="dl-menu"><summary class="btn btn-ghost btn-sm">⬇ ${label}</summary>
            <div class="dl-pop" role="menu">
                <button role="menuitem" data-act="${prefix}Png">🖼 Image (PNG)</button>
                <button role="menuitem" data-act="${prefix}Pdf">📄 PDF</button>
                <button role="menuitem" data-act="${prefix}Csv">📊 Spreadsheet (CSV)</button>
            </div></details>`;
    }
    const closeMenus = () => document.querySelectorAll('.dl-menu[open]').forEach(d => d.removeAttribute('open'));
    document.addEventListener('click', e => { if (!e.target.closest('.dl-menu')) closeMenus(); });

    PMT.exporter = { safeName, font, makeCanvas, fit, rrect, diamond, titleBlock, png, pdf, csv, menu, closeMenus };
})();
