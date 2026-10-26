// MongoDB driver: one Collection object per table, used by repo.js.
// Records carry a string `id`; it is stored as Mongo's `_id`.
import { MongoClient } from 'mongodb';

const toDb = rec => { const { id, ...rest } = rec; return { _id: id, ...rest }; };
const fromDb = doc => { if (!doc) return null; const { _id, ...rest } = doc; return { id: _id, ...rest }; };
const filterToDb = f => {
    if (!f || !('id' in f)) return f || {};
    const { id, ...rest } = f;
    return { _id: id, ...rest };
};

function collection(col) {
    return {
        async insert(rec) { await col.insertOne(toDb(rec)); return rec; },
        async findOne(filter) { return fromDb(await col.findOne(filterToDb(filter))); },
        async find(filter, { sort, skip, limit, fields } = {}) {
            let cur = col.find(filterToDb(filter), fields ? { projection: Object.fromEntries(fields.map(k => [k === 'id' ? '_id' : k, 1])) } : {});
            if (sort) cur = cur.sort(sort);
            if (skip) cur = cur.skip(skip);
            if (limit) cur = cur.limit(limit);
            return (await cur.toArray()).map(fromDb);
        },
        count(filter) { return col.countDocuments(filterToDb(filter)); },
        async distinct(field, filter) { return col.distinct(field === 'id' ? '_id' : field, filterToDb(filter)); },
        // Returns the number of matched records (0 = nothing matched, e.g. a stale version)
        async update(filter, set, inc) {
            const op = {};
            if (set && Object.keys(set).length) op.$set = set;
            if (inc) op.$inc = inc;
            return (await col.updateOne(filterToDb(filter), op)).matchedCount;
        },
        async updateMany(filter, set) { return (await col.updateMany(filterToDb(filter), { $set: set })).matchedCount; },
        async remove(filter) { return (await col.deleteOne(filterToDb(filter))).deletedCount; },
        async removeMany(filter) { return (await col.deleteMany(filterToDb(filter))).deletedCount; }
    };
}

export async function connectMongo({ uri, dbName }) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(dbName);

    // Indexes: unique emails, fast membership look-ups, sessions expire on their own
    await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('users').createIndex({ createdAt: -1 }),
        db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('sessions').createIndex({ userId: 1 }),
        db.collection('companyMembers').createIndex({ companyId: 1, userId: 1 }),
        db.collection('companyMembers').createIndex({ userId: 1 }),
        db.collection('companyMembers').createIndex({ email: 1, status: 1 }),
        db.collection('projects').createIndex({ companyId: 1, deletedAt: 1 }),
        db.collection('projects').createIndex({ ownerId: 1 }),
        db.collection('projectMembers').createIndex({ projectId: 1, userId: 1 }),
        db.collection('projectMembers').createIndex({ userId: 1 }),
        db.collection('projectMembers').createIndex({ email: 1, status: 1 }),
        db.collection('audit').createIndex({ at: -1 }),
        db.collection('audit').createIndex({ actorId: 1, at: -1 }),
        db.collection('emails').createIndex({ at: -1 }),
        db.collection('tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
    // Accounts made before email confirmation existed count as confirmed
    await db.collection('users').updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });

    const names = ['users', 'sessions', 'companies', 'companyMembers', 'projects', 'projectMembers', 'course', 'audit', 'emails', 'tokens', 'avatars'];
    const cols = Object.fromEntries(names.map(n => [n, collection(db.collection(n))]));
    return { cols, close: () => client.close(), ping: () => db.command({ ping: 1 }) };
}
