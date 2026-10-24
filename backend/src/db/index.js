// Picks the database driver. Add a Postgres repo here later (DB_DRIVER=postgres).
import { createRepo } from './repo.js';

export async function openDatabase(config) {
    let conn;
    if (config.dbDriver === 'memory') {
        const { connectMemory } = await import('./memory.js');
        conn = await connectMemory();
    } else if (config.dbDriver === 'mongo') {
        const { connectMongo } = await import('./mongo.js');
        conn = await connectMongo({ uri: config.mongoUri, dbName: config.dbName });
    } else {
        throw new Error(`Unknown DB_DRIVER "${config.dbDriver}" (use mongo or memory)`);
    }
    return { repo: createRepo(conn), close: conn.close, ping: conn.ping };
}
