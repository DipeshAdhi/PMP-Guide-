// All settings come from environment variables (see .env.example)
const env = process.env;

export const config = {
    port: Number(env.PORT) || 4000,
    dbDriver: env.DB_DRIVER || 'mongo',
    mongoUri: env.MONGODB_URI || 'mongodb://localhost:27017/',
    dbName: env.DB_NAME || 'pm_ready',
    adminEmails: (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
    sessionDays: Number(env.SESSION_DAYS) || 30,
    cookieSecure: env.COOKIE_SECURE === 'true',
    // Largest project document accepted (a big project is a few hundred KB)
    maxBody: '5mb'
};
