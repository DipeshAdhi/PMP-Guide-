// All settings come from environment variables (see .env.example)
const env = process.env;

export const config = {
    port: Number(env.PORT) || 4000,
    // 127.0.0.1 = only this computer; hosting platforms need 0.0.0.0
    host: env.HOST || '127.0.0.1',
    dbDriver: env.DB_DRIVER || 'mongo',
    mongoUri: env.MONGODB_URI || 'mongodb://localhost:27017/',
    dbName: env.DB_NAME || 'pm_ready',
    // The one main admin (our company): always an admin, and the only one who can add or remove admins
    superAdminEmail: (env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase(),
    // Extra admins set by configuration (normally empty: the main admin adds admins from the dashboard)
    adminEmails: [...new Set([env.SUPER_ADMIN_EMAIL || '', ...(env.ADMIN_EMAILS || '').split(',')].map(e => e.trim().toLowerCase()).filter(Boolean))],
    sessionDays: Number(env.SESSION_DAYS) || 30,
    cookieSecure: env.COOKIE_SECURE === 'true',
    // Largest project document accepted (a big project is a few hundred KB)
    maxBody: '5mb',
    // Address of the site, used for links in emails
    appUrl: (env.APP_URL || `http://localhost:${Number(env.PORT) || 4000}`).replace(/\/$/, ''),
    // Email: SMTP server (Mailpit locally; Gmail, Resend, SES… in production). No SMTP_HOST = print emails to the console.
    smtp: {
        host: env.SMTP_HOST || '',
        port: Number(env.SMTP_PORT) || 587,
        secure: env.SMTP_SECURE === 'true',
        user: env.SMTP_USER || '',
        pass: env.SMTP_PASS || ''
    },
    mailFrom: env.MAIL_FROM || 'PM Ready <no-reply@pmready.local>',
    // Sign in with Google (OAuth client from Google Cloud Console). Empty = button hidden.
    google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' },
    // Behind a hosting proxy (Render, Railway, Fly, Nginx…) set TRUST_PROXY=1 so client IPs and HTTPS are seen correctly
    trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : 'loopback'
};
