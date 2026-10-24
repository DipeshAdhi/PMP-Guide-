// Make an existing account a platform admin:  npm run make-admin -- you@company.com
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
    console.error('Usage: npm run make-admin -- you@company.com');
    process.exit(1);
}
const db = await openDatabase(config);
const user = await db.repo.users.byEmail(email);
if (!user) {
    console.error(`No account for ${email}. Register on the site first, then run this again.`);
} else {
    await db.repo.users.update(user.id, { platformRole: 'admin' });
    await db.repo.audit.add(null, 'admin.grant', user.id, { via: 'cli' });
    console.log(`${email} is now a platform admin. Open /admin/ after signing in.`);
}
await db.close();
