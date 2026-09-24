const MEAL_KEYS = ['b1', 'b2', 'lunch', 'snack', 'dinner'];
const MEAL_ALIASES = {
    'b1': 'b1', '朝①': 'b1', '朝1': 'b1', '朝食①': 'b1', '朝食1': 'b1',
    'b2': 'b2', '朝②': 'b2', '朝2': 'b2', '朝食②': 'b2', '朝食2': 'b2',
    'lunch': 'lunch', '昼': 'lunch', '昼食': 'lunch',
    'snack': 'snack', '間食': 'snack',
    'dinner': 'dinner', '夕': 'dinner', '夕食': 'dinner'
};
const MEAL_END_HOUR = { b1: 9, b2: 11, lunch: 15, snack: 18, dinner: 24 };
const MAX_ITEMS = 20;
const MAX_PENDING = 50;
const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function handleInbox(request, env, url, cors) {
    if (url.pathname === '/v1/vapid-public-key' && request.method === 'GET') {
        const keys = await getOrCreateVapid(env.DB);
        return json({ publicKey: keys.publicKey }, 200, cors);
    }

    const inboxId = await authenticatedInboxId(request);

    if (url.pathname === '/v1/meals' && request.method === 'POST') {
        return addMeals(request, env, inboxId, cors);
    }
    if (url.pathname === '/v1/pending' && request.method === 'GET') {
        return listPending(env.DB, inboxId, cors);
    }
    if (url.pathname === '/v1/pending' && request.method === 'DELETE') {
        return ackPending(request, env.DB, inboxId, cors);
    }
    if (url.pathname === '/v1/subscription' && request.method === 'PUT') {
        return saveSubscription(request, env.DB, inboxId, cors);
    }
    return json({ error: 'not_found' }, 404, cors);
}

async function addMeals(request, env, inboxId, cors) {
    const body = await readJson(request);
    const items = normalizeRequest(body);
    const pendingCount = await countPending(env.DB, inboxId);
    if (pendingCount + items.length > MAX_PENDING) {
        return json({ error: 'inbox_full' }, 429, cors);
    }

    await env.DB.prepare(
        `DELETE FROM inbox_items WHERE inbox_id = ? AND created_at < ?`
    ).bind(inboxId, Math.floor(Date.now() / 1000) - PENDING_TTL_SECONDS).run();

    const created = [];
    const statements = items.map(item => {
        const id = crypto.randomUUID();
        created.push({ id, ...item });
        return env.DB.prepare(
            `INSERT INTO inbox_items (id, inbox_id, payload, created_at) VALUES (?, ?, ?, unixepoch())`
        ).bind(id, inboxId, JSON.stringify(item));
    });
    await env.DB.batch(statements);

    const pushed = await notify(env, inboxId, created);
    return json({ ok: true, ids: created.map(item => item.id), pushed }, 200, cors);
}

async function listPending(db, inboxId, cors) {
    const rows = await db.prepare(
        `SELECT id, payload, created_at AS createdAt
         FROM inbox_items WHERE inbox_id = ? ORDER BY created_at ASC`
    ).bind(inboxId).all();
    const meals = (rows.results || []).map(row => ({ id: row.id, createdAt: row.createdAt, ...JSON.parse(row.payload) }));
    return json({ meals }, 200, cors);
}

async function ackPending(request, db, inboxId, cors) {
    const body = await readJson(request);
    const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string' && id.length <= 80) : null;
    if (!ids) return json({ error: 'invalid_ids' }, 400, cors);
    if (!ids.length) return json({ ok: true, deleted: 0 }, 200, cors);
    const placeholders = ids.map(() => '?').join(',');
    const result = await db.prepare(
        `DELETE FROM inbox_items WHERE inbox_id = ? AND id IN (${placeholders})`
    ).bind(inboxId, ...ids).run();
    return json({ ok: true, deleted: result.meta?.changes || 0 }, 200, cors);
}

async function saveSubscription(request, db, inboxId, cors) {
    const body = await readJson(request);
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) {
        return json({ error: 'invalid_subscription' }, 400, cors);
    }
    if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 200) {
        return json({ error: 'invalid_subscription' }, 400, cors);
    }
    const subscription = JSON.stringify({ endpoint, keys: { p256dh, auth } });
    await db.prepare(
        `INSERT INTO push_subscriptions (inbox_id, subscription, updated_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(inbox_id) DO UPDATE SET subscription = excluded.subscription, updated_at = unixepoch()`
    ).bind(inboxId, subscription).run();
    return json({ ok: true }, 200, cors);
}

function normalizeRequest(body) {
    const rawItems = Array.isArray(body) ? body : (Array.isArray(body?.meals) ? body.meals : [body]);
    if (!rawItems.length || rawItems.length > MAX_ITEMS) {
        throw new HttpError(400, 'invalid_meals');
    }
    const now = new Date();
    return rawItems.map(item => normalizeMeal(item || {}, now));
}

function normalizeMeal(item, now) {
    const name = cleanName(item.name, item.note);
    const kcal = requiredNumber(item.kcal, 'kcal', 0, 20000);
    const p = requiredNumber(item.p, 'p', 0, 2000);
    const f = requiredNumber(item.f, 'f', 0, 2000);
    const c = requiredNumber(item.c, 'c', 0, 2000);
    const fiber = optionalNumber(item.fiber, 'fiber', 0, 200);
    const salt = optionalNumber(item.salt, 'salt', 0, 50);
    const amount = item.amount == null || item.amount === '' ? 1 : optionalNumber(item.amount, 'amount', 0.01, 10000);
    const unit = item.unit == null || item.unit === '' ? '食' : cleanUnit(item.unit);
    return {
        date: item.date ? cleanDate(item.date) : tokyoDate(now),
        meal: item.meal ? cleanMeal(item.meal) : mealForHour(tokyoHour(now)),
        name,
        amount,
        unit,
        kcal: round1(kcal),
        p: round1(p),
        f: round1(f),
        c: round1(c),
        fiber: round1(fiber),
        salt: round1(salt)
    };
}

function cleanName(name, note) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        throw new HttpError(400, 'invalid_name');
    }
    let text = name.trim().replace(/\s+/g, ' ');
    if (typeof note === 'string' && note.trim()) {
        const extra = note.trim().slice(0, 40);
        if (!text.includes(extra)) text = `${text}（${extra}）`.slice(0, 120);
    }
    return text;
}

function cleanUnit(unit) {
    if (typeof unit !== 'string' || !unit.trim() || unit.trim().length > 8) {
        throw new HttpError(400, 'invalid_unit');
    }
    return unit.trim();
}

function cleanDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new HttpError(400, 'invalid_date');
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new HttpError(400, 'invalid_date');
    }
    return value;
}

function cleanMeal(value) {
    const key = MEAL_ALIASES[String(value).trim()];
    if (!key || !MEAL_KEYS.includes(key)) throw new HttpError(400, 'invalid_meal');
    return key;
}

function requiredNumber(value, field, min, max) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
        throw new HttpError(400, `invalid_${field}`);
    }
    return number;
}

function optionalNumber(value, field, min, max) {
    if (value == null || value === '') return 0;
    return requiredNumber(value, field, min, max);
}

function tokyoDate(now) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now);
}

function tokyoHour(now) {
    const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23'
    }).format(now);
    return Number(hour);
}

function mealForHour(hour) {
    return MEAL_KEYS.find(key => hour < MEAL_END_HOUR[key]) || 'dinner';
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

async function countPending(db, inboxId) {
    const row = await db.prepare(
        `SELECT COUNT(*) AS count FROM inbox_items WHERE inbox_id = ?`
    ).bind(inboxId).first();
    return Number(row?.count || 0);
}

async function notify(env, inboxId, created) {
    const row = await env.DB.prepare(
        `SELECT subscription FROM push_subscriptions WHERE inbox_id = ?`
    ).bind(inboxId).first();
    if (!row) return false;
    let subscription;
    try {
        subscription = JSON.parse(row.subscription);
    } catch {
        return false;
    }
    try {
        const keys = await getOrCreateVapid(env.DB);
        const response = await sendTickle(subscription.endpoint, keys);
        if (response.status === 404 || response.status === 410) {
            await env.DB.prepare(`DELETE FROM push_subscriptions WHERE inbox_id = ?`).bind(inboxId).run();
            return false;
        }
        return response.ok || response.status === 201;
    } catch (error) {
        console.error('push failed', error);
        return false;
    }
}

async function sendTickle(endpoint, keys) {
    const jwt = await vapidJwt(endpoint, keys.privateKey, envSubject());
    return fetch(endpoint, {
        method: 'POST',
        headers: {
            'TTL': '86400',
            'Urgency': 'high',
            'Authorization': `vapid t=${jwt}, k=${keys.publicKey}`
        }
    });
}

function envSubject() {
    return 'mailto:meallog@localhost';
}

async function vapidJwt(endpoint, privateKey, subject) {
    const header = base64UrlBytes(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = base64UrlBytes(new TextEncoder().encode(JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject
    })));
    const signed = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(`${header}.${payload}`)
    );
    return `${header}.${payload}.${base64UrlBytes(new Uint8Array(signed))}`;
}

async function getOrCreateVapid(db) {
    const existing = await db.prepare(
        `SELECT public_key AS publicKey, private_jwk AS privateJwk FROM vapid_keys WHERE id = 1`
    ).first();
    if (existing) return loadVapid(existing);

    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
    const publicKey = base64UrlBytes(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    await db.prepare(
        `INSERT INTO vapid_keys (id, public_key, private_jwk) VALUES (1, ?, ?)
         ON CONFLICT(id) DO NOTHING`
    ).bind(publicKey, privateJwk).run();
    const stored = await db.prepare(
        `SELECT public_key AS publicKey, private_jwk AS privateJwk FROM vapid_keys WHERE id = 1`
    ).first();
    return loadVapid(stored);
}

async function loadVapid(row) {
    const privateKey = await crypto.subtle.importKey(
        'jwk',
        JSON.parse(row.privateJwk),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
    return { publicKey: row.publicKey, privateKey };
}

async function authenticatedInboxId(request) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
    const token = authorization.slice(7).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'unauthorized');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`MealLog inbox id v1\n${token}`));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64UrlBytes(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        throw new HttpError(400, 'invalid_json');
    }
}

function json(body, status, extraHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...extraHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
