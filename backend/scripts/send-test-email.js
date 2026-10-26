// Check the email settings:  npm run email:test -- someone@example.com
import nodemailer from 'nodemailer';
import { config } from '../src/config.js';

const to = (process.argv[2] || '').trim();
if (!to) { console.error('Usage: npm run email:test -- someone@example.com'); process.exit(1); }
if (!config.smtp.host) { console.error('SMTP_HOST is empty in backend/.env, so emails are only printed to the console.'); process.exit(1); }
const transport = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
});
try {
    await transport.verify();
    await transport.sendMail({ from: config.mailFrom, to, subject: 'PM Ready email test', text: `It works: PM Ready can send email through ${config.smtp.host}.` });
    console.log(`Sent a test email to ${to} through ${config.smtp.host}:${config.smtp.port}.`);
} catch (e) {
    console.error(`Could not send through ${config.smtp.host}:${config.smtp.port}: ${e.message}`);
    if (/Username and Password not accepted|535/.test(e.message)) console.error('Gmail refused the login: use an App Password (not your normal password) and check SMTP_USER.');
    process.exit(1);
}
