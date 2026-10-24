/* Emails: invitations, "you were added", verify email, reset password.
   Sent through SMTP (Mailpit locally, a real provider in production).
   Every send is logged in the `emails` table WITHOUT its body, so links
   with tokens never sit in the database or the admin dashboard. */
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { newId } from './db/repo.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Each template returns { subject, lines (paragraphs), button: [label, url] }
const TEMPLATES = {
    inviteProject: v => ({
        subject: `${v.inviter} invited you to the project "${v.project}"`,
        lines: [`${esc(v.inviter)} added you to <strong>${esc(v.project)}</strong>${v.company ? ` (${esc(v.company)})` : ''} on PM Ready as <strong>${esc(v.role)}</strong>.`, 'Create your free account with this email address to open it.'],
        button: ['Accept and create account', v.link]
    }),
    inviteCompany: v => ({
        subject: `${v.inviter} invited you to join ${v.company} on PM Ready`,
        lines: [`${esc(v.inviter)} added you to the staff of <strong>${esc(v.company)}</strong> on PM Ready as <strong>${esc(v.role)}</strong>.`, 'Create your free account with this email address to join.'],
        button: ['Accept and create account', v.link]
    }),
    addedProject: v => ({
        subject: `You were added to "${v.project}"`,
        lines: [`${esc(v.inviter)} gave you <strong>${esc(v.role)}</strong> access to <strong>${esc(v.project)}</strong>${v.company ? ` (${esc(v.company)})` : ''}.`],
        button: ['Open the project', v.link]
    }),
    addedCompany: v => ({
        subject: `You were added to ${v.company}`,
        lines: [`${esc(v.inviter)} added you to the staff of <strong>${esc(v.company)}</strong> as <strong>${esc(v.role)}</strong>.`],
        button: ['Open PM Ready', v.link]
    }),
    verify: v => ({
        subject: 'Confirm your email for PM Ready',
        lines: [`Hi ${esc(v.name)}, confirm this is your email address. Invitations sent to it open only after you confirm.`, 'The link works for 24 hours.'],
        button: ['Confirm my email', v.link]
    }),
    reset: v => ({
        subject: 'Reset your PM Ready password',
        lines: [`Hi ${esc(v.name)}, someone (hopefully you) asked to reset your password.`, 'The link works for 1 hour. If you didn\'t ask, ignore this email: your password stays the same.'],
        button: ['Choose a new password', v.link]
    })
};

function render(t) {
    const [label, url] = t.button;
    const html = `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1F2A37">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="background:#1E2A38;border-radius:12px 12px 0 0;padding:18px 24px;color:#FFB700;font-weight:800;font-size:20px">PM Ready</td></tr>
<tr><td style="padding:24px">${t.lines.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${l}</p>`).join('')}
<p style="margin:22px 0"><a href="${esc(url)}" style="background:#168C86;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${esc(label)}</a></p>
<p style="margin:0;font-size:12px;color:#6B7280">Or paste this link into your browser:<br>${esc(url)}</p></td></tr>
</table></td></tr></table></body></html>`;
    const text = `${t.lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n')}\n\n${label}: ${url}\n`;
    return { html, text };
}

export function createMailer(repo) {
    const transport = config.smtp.host ? nodemailer.createTransport({
        host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    }) : null;
    // Last messages, in memory only (used by tests; never sent to browsers)
    const outbox = [];

    async function send(kind, to, vars, actorId = null) {
        const t = TEMPLATES[kind](vars);
        const { html, text } = render(t);
        outbox.push({ kind, to, subject: t.subject, text, link: t.button[1] });
        if (outbox.length > 50) outbox.shift();
        let status = 'sent', error = null;
        try {
            if (transport) await transport.sendMail({ from: config.mailFrom, to, subject: t.subject, text, html });
            else { status = 'logged'; console.log(`\n✉  To: ${to}\n   ${t.subject}\n   ${t.button[1]}\n`); }
        } catch (e) {
            status = 'failed';
            error = e.message.slice(0, 300);
            console.error(`Email to ${to} failed: ${error}`);
        }
        await repo.emails.add({ id: newId('e'), at: new Date().toISOString(), to, kind, subject: t.subject, status, error, actorId });
        return status !== 'failed';
    }
    return { send, outbox, enabled: !!transport };
}
