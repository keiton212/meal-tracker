import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { enqueueMeals, isPushEndpoint } from '../worker/inbox.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0002_inbox.sql', import.meta.url), 'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0003_mcp.sql', import.meta.url), 'utf8'));
const DB = {
    prepare(sql) {
        let values = [];
        return {
            bind(...args) { values = args; return this; },
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            async run() { return { meta: sqlite.prepare(sql).run(...values) }; }
        };
    },
    async batch(statements) {
        sqlite.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
};
const endpoint = 'https://web.push.apple.com/test-only-endpoint';
sqlite.prepare('INSERT INTO push_subscriptions VALUES (?, ?, unixepoch())').run('test-inbox', JSON.stringify({ endpoint }));
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const { public_key } = sqlite.prepare('SELECT public_key FROM vapid_keys WHERE id = 1').get();
    const auth = options.headers.Authorization;
    const jwt = auth.match(/^vapid t=(.+), k=/)[1];
    assert(auth.endsWith(public_key));
    const [header, payload, signature] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.aud, new URL(endpoint).origin);
    assert.equal(claims.sub, 'https://meal-tracker-cloud.nest-task-manager.workers.dev');
    assert(claims.exp > Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', Buffer.from(public_key, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`)));
    return new Response(null, { status: 201 });
};
try {
    const body = { name: '通知テスト', kcal: 100, p: 5, f: 2, c: 15 };
    const result = await enqueueMeals(body, { DB }, 'test-inbox', 'push-test-1');
    assert.equal(result.pushed, true);
    const again = await enqueueMeals(body, { DB }, 'test-inbox', 'push-test-1');
    assert.equal(again.duplicate, true);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(null, { status: 410 });
    assert.equal((await enqueueMeals(body, { DB }, 'test-inbox', 'push-test-2')).pushed, false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').get().count, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM inbox_items').get().count, 2);
    assert(!isPushEndpoint('https://web.push.apple.com.evil.example/push'));
    assert(!isPushEndpoint('https://user:pass@web.push.apple.com/push'));
    const insert = sqlite.prepare('INSERT INTO inbox_items VALUES (?, ?, ?, unixepoch())');
    for (let index = 0; index < 50; index++) insert.run(`capacity-${index}`, 'full-inbox', '{}');
    await assert.rejects(enqueueMeals(body, { DB }, 'full-inbox', 'full-inbox-request'), /inbox_full/);
    assert.throws(() => insert.run('over-capacity', 'full-inbox', '{}'), /inbox_full/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM meal_requests WHERE inbox_id = ?').get('full-inbox').count, 0);
    console.log('PASS Apple push request and VAPID signature; retry does not send twice; expired subscription cleanup; saved meals survive notification failure; SSRF guards. No real push was sent.');
    console.log('PASS Inbox capacity limit and transactional database guard.');
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
